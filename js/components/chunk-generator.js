AFRAME.registerComponent('chunk-generator', {
  schema: {
    chunkSize:        { type: 'int', default: 50 },
    viewDistance:     { type: 'number', default: 200 },
    terrainScale:     { type: 'number', default: 100 },
    noiseOctaves:     { type: 'int', default: 8 },
    noisePersistence: { type: 'number', default: 0.5 },
    noiseLacunarity:  { type: 'number', default: 2.0 },
    randomSeed:       { type: 'int', default: 0 },
    worldOffset:      { type: 'vec2', default: { x: 0, y: 0 } },
    heightScale:      { type: 'number', default: 30.0 },
    heightCurve:      { type: 'string', default: '[[0.46,0],[0.48,0.05],[0.5,0.1],[0.6,0.2],[0.7,0.4],[0.8,0.5],[0.85,0.6],[0.9,0.7],[1,1]]' },
    terrainRegions:   { type: 'string', default: '[{"name":"WaterDeep","height":0.2,"color":"#0048FF"},{"name":"WaterShallow","height":0.46,"color":"#0087FF"},{"name":"Sand","height":0.5,"color":"#c2b280"},{"name":"Grass1","height":0.6,"color":"#348C31"},{"name":"Mud","height":0.7,"color":"#70543e"},{"name":"Grass2","height":0.8,"color":"#1F6420"},{"name":"Snow","height":0.9,"color":"#FFFFFF"}]' },
    detailLevel:      { type: 'string', default: '[[100,0],[200,1]]' },
    normalizeMethod:  { type: 'string', default: 'global' },
    applyFalloff:     { type: 'boolean', default: false },
    normalizePostFalloff: { type: 'boolean', default: false },
    renderMode:       { type: 'string', default: 'mesh' },
    textureFilter:    { type: 'string', default: 'linear' },
    enablePhysics:    { type: 'boolean', default: false },
    updateInterval:   { type: 'number', default: 100 }
  },

  init() {
    this.chunks = new Map();
    this.lastViewerChunkCoord = { x: null, y: null };
    this.globalOctaveOffsets = this.createGlobalOctaveOffsets(this.data.randomSeed, this.data.noiseOctaves);
    this.viewer = document.querySelector('[camera]');
    this.chunkSizeMinusOne = this.data.chunkSize - 1;
    this.chunksVisible = Math.ceil(this.data.viewDistance / this.chunkSizeMinusOne);
    this.lastUpdateTime = 0;
    this.setupUpdateLoop();
    this.updateChunks();
  },

  tick(time, timeDelta) {
    if (!this.viewer) return;

    const pos = this.viewer.object3D.position;
    const { chunkSizeMinusOne } = this;
    const currentChunkX = Math.floor(pos.x / chunkSizeMinusOne);
    const currentChunkY = Math.floor(pos.z / chunkSizeMinusOne);

    if (this.hasChunkCoordChanged(currentChunkX, currentChunkY)) {
      this.lastViewerChunkCoord = { x: currentChunkX, y: currentChunkY };
      this.updateChunks();
    }

    if (time - this.lastUpdateTime > this.data.updateInterval) {
      this.updateLOD(time);
    }
  },

  updateLOD(time) {
    const cameraPos = new THREE.Vector3();
    this.viewer.object3D.getWorldPosition(cameraPos);
    this.chunks.forEach(chunk => {
      if (chunk && chunk.components && chunk.components['terrain-chunk']) {
        chunk.components['terrain-chunk'].updateDetailLevel(cameraPos);
      } else {
        console.warn('Invalid chunk or terrain-chunk component', chunk);
      }
    });
    this.lastUpdateTime = time;
  },

  hasChunkCoordChanged(x, y) {
    const last = this.lastViewerChunkCoord;
    return last.x !== x || last.y !== y;
  },

  updateChunks() {
    const { chunksVisible, chunkSizeMinusOne, data } = this;
    const { x: viewerX, y: viewerY } = this.lastViewerChunkCoord;
    const visibleChunks = new Set();

    const minX = viewerX - chunksVisible;
    const maxX = viewerX + chunksVisible;
    const minY = viewerY - chunksVisible;
    const maxY = viewerY + chunksVisible;

    const generateKey = (x, y) => `${x}_${y}`;

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const key = generateKey(x, y);
        
        if (!this.chunks.has(key)) {
          const chunkEl = this.createChunk(x, y);
          this.el.appendChild(chunkEl);
          this.chunks.set(key, chunkEl);
        }
        visibleChunks.add(key);
      }
    }

    for (const [key, chunkEl] of this.chunks) {
      if (!visibleChunks.has(key)) {
        this.el.removeChild(chunkEl);
        this.chunks.delete(key);
      }
    }
  },

  createChunk(chunkCoordX, chunkCoordY) {
    const chunkEl = document.createElement('a-entity');
    const { chunkSizeMinusOne, data, globalOctaveOffsets } = this;

    chunkEl.setAttribute('position', {
      x: chunkCoordX * chunkSizeMinusOne,
      y: 0,
      z: chunkCoordY * chunkSizeMinusOne
    });

    chunkEl.setAttribute('terrain-chunk', {
      renderMode: data.renderMode,
      chunkWidth: data.chunkSize,
      chunkHeight: data.chunkSize,
      terrainScale: data.terrainScale,
      noiseOctaves: data.noiseOctaves,
      noisePersistence: data.noisePersistence,
      noiseLacunarity: data.noiseLacunarity,
      randomSeed: data.randomSeed,
      worldOffset: data.worldOffset,
      globalOctaveOffsets: JSON.stringify(globalOctaveOffsets),
      chunkX: chunkCoordX,
      chunkY: chunkCoordY,
      heightScale: data.heightScale,
      heightCurve: data.heightCurve,
      terrainRegions: data.terrainRegions,
      detailLevel: data.detailLevel,
      normalizeMethod: data.normalizeMethod,
      applyFalloff: data.applyFalloff,
      normalizePostFalloff: data.normalizePostFalloff,
      textureFilter: data.textureFilter,
      enablePhysics: data.enablePhysics
    });

    return chunkEl;
  },

  createGlobalOctaveOffsets(seed, octaves) {
    const random = this.seededRandom(seed);
    const offsets = new Array(octaves);
    
    for (let i = 0; i < octaves; i++) {
      const randX = random() * 200000 - 100000;
      const randY = random() * 200000 - 100000;
      offsets[i] = { x: randX, y: randY };
    }
    return offsets;
  },

  seededRandom(seed) {
    let state = seed >>> 0;
    const m = 0x80000000;
    const a = 1103515245;
    const c = 12345;

    return function() {
      state = (a * state + c) & (m - 1);
      return state / (m - 1);
    };
  },

  setupUpdateLoop() {
    this.el.sceneEl.addBehavior(this);
  }
});
