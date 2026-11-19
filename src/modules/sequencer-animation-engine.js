import * as lib from "../lib/lib.js";

const SequencerAnimationEngine = {
	_animations: [],
	_debug: undefined,
	_deltas: [],

	ticker: false,
	dt: 0,

	isRunning: false,

	addAnimation(origin, attributes = [], timeDifference = 0) {
		if (!Array.isArray(attributes)) attributes = [attributes];

		return new Promise((resolve) => {
			this._animations.push({
				origin,
				attributes: attributes.map((attribute) => {
					attribute.targetId = lib.get_object_identifier(attribute.target) + "-" + attribute.propertyName;
					attribute.id = foundry.utils.randomID();
					attribute.started = false;
					attribute.initialized = false;
					attribute.finishing = false;
					attribute.complete = false;
					attribute.previousValue = null;
					attribute.progress = 0;
					attribute.value = 0;
					attribute.coreValue = 0;
					attribute.isFunkyProperty = attribute.propertyName.startsWith("scale.");
					attribute.path = attribute.propertyName.split(".");

					attribute.duration = attribute.duration ?? 0;
					attribute.durationDone = timeDifference ?? 0;

					if (attribute?.looping) {
						attribute.loopDuration = attribute.loopDuration ?? attribute.duration ?? 0;
						attribute.loopDurationDone = timeDifference % attribute.loopDuration ?? 0;
						attribute.loops = attribute.loops ?? 0;
						attribute.loopsDone = Math.floor(
							attribute.durationDone / attribute.duration
						);
						attribute.index = attribute.loopsDone % attribute.values.length;
						attribute.nextIndex =
							(attribute.loopsDone + 1) % attribute.values.length;
						if (!attribute.pingPong && attribute.nextIndex === 0) {
							attribute.index = 0;
							attribute.nextIndex = 1;
						}
					}
					return attribute;
				}),
				complete: false,
				totalDt: timeDifference,
				resolve: resolve,
			});

			this._animations.sort((a, b) => {
				const aNumAbsolute = a.attributes.filter(attr => !attr.complete && attr.absolute).length;
				const bNumAbsolute = b.attributes.filter(attr => !attr.complete && attr.absolute).length;
				return bNumAbsolute - aNumAbsolute;
			});

			if (!this.ticker) {
				this.start();
			}

			lib.debug(`Added animations to Animation Engine`);
		});
	},

	/**
	 * Whether any unfinished animation was added for the given origin (an effect id, for example)
	 *
	 * @param {string} origin
	 * @returns {boolean}
	 */
	hasAnimations(origin) {
		return this._animations.some((animation) => animation.origin === origin && !animation.complete);
	},

	endAnimations(target) {
		this._animations = this._animations.filter(
			(animation) => animation.origin !== target
		);
	},

	updateStartValues(target, propertyName) {
		const targetId = lib.get_object_identifier(target) + "-" + propertyName;
		if (targetId in this._coreValues) {
			this._coreValues[targetId].value = lib.deep_get(target, propertyName);
		}
	},

	start() {
		if (!this.ticker) {
			lib.debug(`Animation Engine Started`);
			this.ticker = foundry.canvas.animation.CanvasAnimation.ticker;
			this.ticker.add(this.nextFrame.bind(this));
		}
	},

	nextFrame() {
		if (this._animations.length === 0) {
			this._coreValues = {};
			this._storedEntries.clear();
			return;
		}

		// Per-frame values are kept in reused entries (one per target property) instead of a fresh object
		// map every frame; _touched lists the entries written this frame, in first-touch order.
		this._frame++;
		this._touched.length = 0;

		const animations = this._animations;
		for (let i = 0; i < animations.length; i++) {
			this._animate(animations[i]);
		}

		for (let i = 0; i < this._touched.length; i++) {
			const delta = this._touched[i];
			try {
				lib.deep_set(delta.target, delta.path, delta.value);
			} catch (err) {
			}
		}

		// Forget entries no animation wrote this frame, so ended targets aren't kept alive
		if (this._storedEntries.size > this._touched.length) {
			for (const [targetId, entry] of this._storedEntries) {
				if (entry.frame !== this._frame) this._storedEntries.delete(targetId);
			}
		}

		// Drop finished animations in place
		const list = this._animations;
		let write = 0;
		for (let read = 0; read < list.length; read++) {
			if (!list[read].complete) list[write++] = list[read];
		}
		list.length = write;
	},

	_coreValues: {},
	_storedEntries: new Map(),
	_touched: [],
	_frame: 0,

	/**
	 * The value being built for a target property this frame
	 * @private
	 */
	_storedValue(attribute) {
		let entry = this._storedEntries.get(attribute.targetId);
		if (!entry) {
			entry = { frame: -1, value: 0, target: null, path: null, targetId: attribute.targetId };
			this._storedEntries.set(attribute.targetId, entry);
		}
		if (entry.frame !== this._frame) {
			entry.frame = this._frame;
			entry.value = this._coreValues[attribute.targetId].value;
			entry.target = attribute.target;
			entry.path = attribute.path;
			this._touched.push(entry);
		}
		return entry;
	},

	_animate(animation) {
		animation.totalDt += this.ticker.elapsedMS;

		const attributes = animation.attributes;
		let remaining = 0;
		for (let i = 0; i < attributes.length; i++) {
			const attr = attributes[i];
			if (attr.complete) continue;
			if (animation.totalDt >= attr.delay) {
				this._animateAttribute(attr);
				if (attr.finishing) {
					attr.complete = true;
					if (this._coreValues[attr.targetId]) {
						delete this._coreValues[attr.targetId];
					}
					continue;
				}
			}
			remaining++;
		}

		animation.complete = remaining === 0;

		if (animation.complete) {
			animation.resolve();
		}
	},

	_animateAttribute(attribute) {
		attribute.path ??= attribute.propertyName.split(".");

		if (this._coreValues[attribute.targetId] === undefined) {
			this._coreValues[attribute.targetId] = {
				id: attribute.id,
				value: lib.deep_get(attribute.target, attribute.path)
			};
		}

		const stored = this._storedValue(attribute);

		if (attribute?.looping && attribute?.indefinite) {
			this._handleIndefiniteLoop(attribute);
		} else if (attribute?.looping) {
			this._handleLoops(attribute);
		} else {
			this._handleDefault(attribute);
		}

		// This is absolutely horrendous, but 50% of the time, it works 90% of the time.
		if (attribute.absolute) {
			this._coreValues[attribute.targetId].value = attribute.value;
			const delta = this._coreValues[attribute.targetId].value - stored.value;
			stored.value += delta;
		} else {
			if (attribute.isFunkyProperty) {
				const coreValue = this._coreValues[attribute.targetId].value;
				attribute.delta = (coreValue * attribute.value) - coreValue;
				stored.value += attribute.delta;
			} else {
				stored.value += attribute.value;
			}
		}

	},

	_handleBaseLoop(attribute) {
		if (!attribute.initialized) {
			if (attribute.values.length === 1) {
				attribute.values.unshift(this._coreValues[attribute.targetId].value);
			}
			attribute.initialized = true;
		}

		attribute.loopDurationDone += this.ticker.deltaMS;
		attribute.progress = attribute.loopDurationDone / attribute.loopDuration;

		attribute.value = lib.interpolate(
			attribute.values[attribute.index],
			attribute.values[attribute.nextIndex],
			attribute.progress,
			attribute.ease
		);

		if (attribute.progress >= 1.0) {
			attribute.loopDurationDone -= attribute.loopDuration;

			attribute.index = (attribute.index + 1) % attribute.values.length;
			attribute.nextIndex = (attribute.nextIndex + 1) % attribute.values.length;

			if (!attribute.pingPong && attribute.nextIndex === 0) {
				attribute.index = 0;
				attribute.nextIndex = 1;
			}

			attribute.loopsDone++;

			attribute.value = lib.interpolate(
				attribute.values[attribute.index],
				attribute.values[attribute.nextIndex],
				attribute.progress % 1.0,
				attribute.ease
			);
		}
	},

	_handleIndefiniteLoop(attribute) {
		return this._handleBaseLoop(attribute);
	},

	_handleLoops(attribute) {
		this._handleBaseLoop(attribute);

		attribute.durationDone += this.ticker.deltaMS;
		attribute.overallProgress = attribute.durationDone / attribute.duration;

		if (
			attribute.progress >= 1.0 &&
			attribute.loopsDone === attribute.loops * 2
		) {
			attribute.finishing = true;
			attribute.value = attribute.values[attribute.index];
		}

		if (attribute.overallProgress >= 1.0) {
			attribute.finishing = true;
		}
	},

	_handleDefault(attribute) {
		if (!attribute.initialized) {
			if (attribute.from === undefined) {
				attribute.from = this._coreValues[attribute.targetId].value;
			}
			attribute.initialized = true;
		}

		attribute.durationDone += this.ticker.deltaMS;
		attribute.progress = attribute.durationDone / attribute.duration;

		attribute.value = lib.interpolate(
			attribute.from,
			attribute.to,
			lib.clamp(attribute.progress, 0.0, 1.0),
			attribute.ease
		);

		if (attribute.progress >= 1.0) {
			attribute.value = attribute.to;
			attribute.finishing = true;
		}
	},
};

export default SequencerAnimationEngine;
