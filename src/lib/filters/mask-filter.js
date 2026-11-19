
import RenderOptimizations from "../render-optimizations.js";

let fragmentShader = `\
        varying vec2 vTextureCoord;

        uniform sampler2D uSampler;
        uniform sampler2D uMaskSampler;

        void main(void) {
            gl_FragColor = texture2D(uSampler, vTextureCoord)
                * texture2D(uMaskSampler, vTextureCoord).a;
        }`;

/**
 * Stable numeric ids for display objects and textures, used in cache keys.
 * @type {WeakMap<object, number>}
 */
const objectIds = new WeakMap();
let nextObjectId = 1;
function objectId(obj) {
  if (!obj) return 0;
  let id = objectIds.get(obj);
  if (!id) {
    id = nextObjectId++;
    objectIds.set(obj, id);
  }
  return id;
}

/** How many cached mask textures to keep per filtered object (primary pass + region "void" pass). */
const MAX_ENTRIES_PER_TARGET = 2;

export default class MaskFilter extends foundry.canvas.rendering.filters.AbstractBaseFilter {

  /** @override */
  static defaultUniforms = { uMaskSampler: null };

  /** @override */
  static fragmentShader = fragmentShader;

  /** @type {DisplayObject[]|null} */
  masks = [];

	static _createFragmentShader() {
		return fragmentShader;
	}

  /**
   * Cached mask textures, per filtered display object.
   * @type {Map<PIXI.DisplayObject, {key: number[], texture: PIXI.RenderTexture}[]>}
   */
  #cache = new Map();

  /** @type {(() => void) | null} */
  #unregisterDisableListener = null;

  /** @override */
  apply(filterManager, input, output, clearMode, currentState) {
    const target = currentState.target;
    const key = RenderOptimizations.enabled && target ? this.#buildCacheKey(filterManager, input, currentState) : null;
    if (!key) {
      if (this.#cache.size) this.releaseCache();
      return this.#applyUncached(filterManager, input, output, clearMode, currentState);
    }

    this.#pruneDestroyedTargets();
    this.#unregisterDisableListener ??= RenderOptimizations.onDisable(() => this.releaseCache());

    let entries = this.#cache.get(target);
    if (!entries) {
      entries = [];
      this.#cache.set(target, entries);
    }

    let entry = entries.find((e) => this.#textureMatches(e.texture, input) && keysEqual(e.key, key));
    if (entry) {
      // Most recently used entry goes last
      if (entries[entries.length - 1] !== entry) {
        entries.splice(entries.indexOf(entry), 1);
        entries.push(entry);
      }
    } else {
      // Drop entries whose texture no longer fits the input, then evict the least recently used
      // entry when full (reusing its texture if it fits), or take a fresh texture from the pool
      for (let i = entries.length - 1; i >= 0; i--) {
        if (this.#textureMatches(entries[i].texture, input)) continue;
        filterManager.returnFilterTexture(entries[i].texture);
        entries.splice(i, 1);
      }
      let texture = null;
      if (entries.length >= MAX_ENTRIES_PER_TARGET) {
        texture = entries.shift().texture;
      }
      texture ??= filterManager.getFilterTexture();
      this.#renderMasks(filterManager, currentState, texture);
      entry = { key, texture };
      entries.push(entry);
    }

    this.uniforms.uMaskSampler = entry.texture;
    filterManager.applyFilter(this, input, output, clearMode);
  }

  /**
   * Returns all cached mask textures to the renderer's filter texture pool.
   * Called when the owning effect is destroyed and when the optimization is turned off.
   */
  releaseCache() {
    const filterManager = canvas?.app?.renderer?.filter;
    for (const entries of this.#cache.values()) {
      for (const { texture } of entries) {
        if (filterManager) filterManager.returnFilterTexture(texture);
        else texture.destroy(true);
      }
    }
    this.#cache.clear();
    this.#unregisterDisableListener?.();
    this.#unregisterDisableListener = null;
  }

  /** @override */
  destroy() {
    this.releaseCache();
    super.destroy?.();
  }

  #applyUncached(filterManager, input, output, clearMode, currentState) {
    const maskFilterTexture = filterManager.getFilterTexture();
    this.#renderMasks(filterManager, currentState, maskFilterTexture);
    this.uniforms.uMaskSampler = maskFilterTexture;
    filterManager.applyFilter(this, input, output, clearMode);
    filterManager.returnFilterTexture(maskFilterTexture);
  }

  #renderMasks(filterManager, currentState, maskFilterTexture) {
    const originalFilterTexture = this.#push(
      filterManager,
      currentState,
      maskFilterTexture
    );
    const renderer = filterManager.renderer;

    for (const mask of this.masks) {
      if (!mask || mask.destroyed || mask.obj?.destroyed) continue;
      const renderable = mask.renderable;
      mask.renderable = true;
      mask.render(renderer);
      mask.renderable = renderable;
    }

    renderer.batch.flush();

    this.#pop(filterManager, currentState, originalFilterTexture);
  }

  #textureMatches(texture, input) {
    return !texture.destroyed
      && texture.width === input.width
      && texture.height === input.height
      && texture.resolution === input.resolution
      && texture.baseTexture.width === input.baseTexture.width
      && texture.baseTexture.height === input.baseTexture.height;
  }

  #pruneDestroyedTargets() {
    for (const [target, entries] of this.#cache) {
      if (!target.destroyed) continue;
      for (const { texture } of entries) texture.destroy(true);
      this.#cache.delete(target);
    }
  }

  /**
   * Builds a fingerprint of everything that affects the rendered mask texture.
   * Returns null when the masks contain anything whose output can't be
   * fingerprinted cheaply (token/tile meshes: video frames, token ring shader
   * time, occlusion textures), in which case the mask is rendered every frame
   * as before.
   * @returns {number[] | null}
   */
  #buildCacheKey(filterManager, input, currentState) {
    const renderer = filterManager.renderer;
    const frame = currentState.sourceFrame;
    const key = [
      renderer.CONTEXT_UID ?? 0,
      currentState.resolution,
      frame.x, frame.y, frame.width, frame.height,
      input.width, input.height,
      this.masks.length,
    ];
    for (const mask of this.masks) {
      if (!mask || mask.destroyed || mask.obj?.destroyed) {
        key.push(-1);
        continue;
      }
      if (!appendGraphicsKey(key, mask, true)) return null;
    }
    return key;
  }

  #push(filterManager, currentState, maskFilterTexture) {
    const originalFilterTexture = currentState.renderTexture;

    currentState.renderTexture = maskFilterTexture;
    filterManager.defaultFilterStack.push(currentState);
    filterManager.bindAndClear(maskFilterTexture);

    return originalFilterTexture;
  }

  #pop(filterManager, currentState, originalFilterTexture) {
    currentState.renderTexture = originalFilterTexture;
    filterManager.defaultFilterStack.pop();

    if (filterManager.activeState === currentState) {
      return;
    }

    filterManager.activeState = currentState;

    const globalUniforms = filterManager.globalUniforms.uniforms;

    globalUniforms.outputFrame = currentState.sourceFrame;
    globalUniforms.resolution = currentState.resolution;

    const inputSize = globalUniforms.inputSize;
    const inputPixel = globalUniforms.inputPixel;
    const inputClamp = globalUniforms.inputClamp;

    inputSize[0] = currentState.destinationFrame.width;
    inputSize[1] = currentState.destinationFrame.height;
    inputSize[2] = 1.0 / inputSize[0];
    inputSize[3] = 1.0 / inputSize[1];

    inputPixel[0] = Math.round(inputSize[0] * currentState.resolution);
    inputPixel[1] = Math.round(inputSize[1] * currentState.resolution);
    inputPixel[2] = 1.0 / inputPixel[0];
    inputPixel[3] = 1.0 / inputPixel[1];

    inputClamp[0] = 0.5 * inputPixel[2];
    inputClamp[1] = 0.5 * inputPixel[3];
    inputClamp[2] =
      currentState.sourceFrame.width * inputSize[2] - 0.5 * inputPixel[2];
    inputClamp[3] =
      currentState.sourceFrame.height * inputSize[3] - 0.5 * inputPixel[3];

    if (currentState.legacy) {
      const filterArea = globalUniforms.filterArea;

      filterArea[0] = currentState.destinationFrame.width;
      filterArea[1] = currentState.destinationFrame.height;
      filterArea[2] = currentState.sourceFrame.x;
      filterArea[3] = currentState.sourceFrame.y;

      globalUniforms.filterClamp = globalUniforms.inputClamp;
    }

    filterManager.globalUniforms.update();
  }
}

/**
 * @param {number[]} a
 * @param {number[]} b
 */
function keysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false;
  }
  return true;
}

/**
 * Appends the state of a Graphics mask (and its children) to the key.
 * @param {number[]} key
 * @param {PIXI.DisplayObject} obj
 * @param {boolean} isRoot   The root mask is force-rendered regardless of `renderable`.
 * @returns {boolean} false if the object can't be fingerprinted
 */
function appendGraphicsKey(key, obj, isRoot) {
  // Foundry moves the original PIXI.Graphics to PIXI.LegacyGraphics and replaces PIXI.Graphics with SmoothGraphics.
  // Sequencer's masks are LegacyGraphics; both geometry classes keep the `dirty`/`batchDirty` counters.
  const isGraphics = (PIXI.LegacyGraphics && obj instanceof PIXI.LegacyGraphics) || obj instanceof PIXI.Graphics;
  if (!isGraphics) return false;
  const geometry = obj.geometry;
  const wt = obj.worldTransform;
  key.push(
    objectId(obj),
    obj.visible ? 1 : 0,
    isRoot || obj.renderable ? 1 : 0,
    obj.worldAlpha,
    wt.a, wt.b, wt.c, wt.d, wt.tx, wt.ty,
    objectId(geometry),
    geometry?.dirty ?? 0,
    geometry?.batchDirty ?? 0,
    // Unfinished paths are completed (and the geometry changed) on render
    obj.currentPath ? 1 : 0,
    obj.tint ?? 0xffffff,
    obj.blendMode ?? 0,
    objectId(obj._mask),
    obj.filters?.length ?? 0,
    obj.children.length,
  );
  if (obj._mask || obj.filters?.length) return false;
  for (const child of obj.children) {
    if (!appendGraphicsKey(key, child, false)) return false;
  }
  return true;
}
