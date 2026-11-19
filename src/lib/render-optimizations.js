/**
 * Shared on/off switch for the rendering optimizations added in 4.3.0.n2
 * (mask texture caching, off-screen culling of filtered/masked effects, and
 * skipping video texture uploads for effects that are not visible).
 *
 * Read on hot paths every frame, so the setting value is mirrored into a
 * plain property instead of calling game.settings.get() each time.
 */
const RenderOptimizations = {
	enabled: true,

	/** @type {Set<() => void>} */
	_disableListeners: new Set(),

	/**
	 * @param {boolean} value
	 */
	set(value) {
		const enabled = !!value;
		if (enabled === this.enabled) return;
		this.enabled = enabled;
		if (!enabled) {
			for (const listener of this._disableListeners) {
				try {
					listener();
				} catch (err) {
					console.error(err);
				}
			}
		}
	},

	/**
	 * Registers a callback that runs when the optimizations are turned off, so
	 * cached state (mask textures, paused video uploads) can be restored.
	 * @param {() => void} listener
	 * @returns {() => void} unregister function
	 */
	onDisable(listener) {
		this._disableListeners.add(listener);
		return () => this._disableListeners.delete(listener);
	},
};

export default RenderOptimizations;
