AFRAME.registerComponent('terrain-chunk', {
  schema: {
    renderMode:       { type: 'string', default: 'mesh' },
    chunkWidth:       { type: 'int', default: 50 },
    chunkHeight:      { type: 'int', default: 50 },
    terrainScale:     { type: 'number', default: 100 },
    noiseOctaves:     { type: 'int', default: 8 },
    noisePersistence: { type: 'number', default: 0.5 },
    noiseLacunarity:  { type: 'number', default: 2.0 },
    randomSeed:       { type: 'int', default: 0 },
    worldOffset:      { type: 'vec2', default: { x: 0, y: 0 } },
    globalOctaveOffsets: { type: 'string', default: '[]' },
    chunkX:           { type: 'int', default: 0 },
    chunkY:           { type: 'int', default: 0 },
    heightScale:      { type: 'number', default: 30.0 },
    heightCurve:      { type: 'string', default: '[[0.46,0],[0.48,0.05],[0.5,0.1],[0.6,0.2],[0.7,0.4],[0.8,0.5],[0.85,0.6],[0.9,0.7],[1,1]]' },
    terrainRegions:   { type: 'string', default: '[{"name":"WaterDeep","height":0.2,"color":"#0048FF"},{"name":"WaterShallow","height":0.46,"color":"#0087FF"},{"name":"Sand","height":0.5,"color":"#c2b280"},{"name":"Grass1","height":0.6,"color":"#348C31"},{"name":"Mud","height":0.7,"color":"#70543e"},{"name":"Grass2","height":0.8,"color":"#1F6420"},{"name":"Snow","height":0.9,"color":"#FFFFFF"}]' },
    detailLevel:      { type: 'string', default: '[[100,0],[200,1]]' },
    normalizeMethod:  { type: 'string', default: 'global' },
    applyFalloff:     { type: 'boolean', default: false },
    normalizePostFalloff: { type: 'boolean', default: false },
    textureFilter:    { type: 'string', default: 'linear' },
    enablePhysics:    { type: 'boolean', default: false }
  },

  init() {
    this.keyframes = this.parseJSON(this.data.heightCurve, [[0.5, 0], [0.57, 0.2], [0.8, 0.5], [1, 1]], 'Invalid height curve JSON');
    noise.seed(this.data.randomSeed);
    this.currentDetailLevel = 0;
    this.generateMap();
  },

  parseJSON(str, fallback, errorMsg) {
    try {
      return JSON.parse(str);
    } catch (e) {
      console.error(errorMsg, e);
      return fallback;
    }
  },

  generateMap() {
    const { chunkWidth: width, chunkHeight: height, terrainScale, noiseOctaves, noisePersistence, noiseLacunarity,
            worldOffset, chunkX, chunkY, normalizeMethod, applyFalloff, normalizePostFalloff,
            renderMode, heightScale } = this.data;

    const scale = Math.max(terrainScale, 0.0001);
    const globalOffsets = this.parseJSON(this.data.globalOctaveOffsets, [], 'Invalid globalOctaveOffsets');
    const worldOffsetX = worldOffset.x + chunkX * (width - 1);
    const worldOffsetY = worldOffset.y + chunkY * (height - 1);

    const noiseMap = new Array(width).fill().map(() => new Float32Array(height));
    let maxNoiseHeight = -Infinity;
    let minNoiseHeight = Infinity;

    this.generateNoise(noiseMap, width, height, scale, noiseOctaves, noisePersistence, noiseLacunarity,
                      worldOffsetX, worldOffsetY, globalOffsets, normalizeMethod,
                      maxNoiseHeight, minNoiseHeight);

    if (applyFalloff) {
      this.applyFalloff(noiseMap, width, height, normalizePostFalloff);
    }

    this.normalizeMap(noiseMap, width, height, normalizeMethod, noisePersistence, noiseOctaves,
                     minNoiseHeight, maxNoiseHeight);

    this.renderTerrain(noiseMap, width, height, renderMode, heightScale);
  },

  generateNoise(noiseMap, width, height, scale, octaves, persistence, lacunarity,
                worldOffsetX, worldOffsetY, globalOffsets, normalizeMethod,
                maxNoiseHeight, minNoiseHeight) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let amplitude = 1;
        let frequency = 1;
        let noiseHeight = 0;

        for (let i = 0; i < octaves; i++) {
          const offsetX = globalOffsets[i]?.x || 0;
          const offsetY = globalOffsets[i]?.y || 0;
          const sampleX = ((x + worldOffsetX) / scale) * frequency + offsetX;
          const sampleY = ((y + worldOffsetY) / scale) * frequency + offsetY;
          noiseHeight += noise.perlin2(sampleX, sampleY) * amplitude;
          amplitude *= persistence;
          frequency *= lacunarity;
        }

        noiseMap[x][y] = noiseHeight;
        if (normalizeMethod === 'local') {
          maxNoiseHeight = Math.max(maxNoiseHeight, noiseHeight);
          minNoiseHeight = Math.min(minNoiseHeight, noiseHeight);
        }
      }
    }
    return { maxNoiseHeight, minNoiseHeight };
  },

  applyFalloff(noiseMap, width, height, normalizePostFalloff) {
    const falloffMap = generateFalloffMap(width);
    let minHeight = Infinity;
    let maxHeight = -Infinity;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        noiseMap[x][y] = Math.max(0, noiseMap[x][y] - falloffMap[x][y]);
        if (normalizePostFalloff) {
          minHeight = Math.min(minHeight, noiseMap[x][y]);
          maxHeight = Math.max(maxHeight, noiseMap[x][y]);
        }
      }
    }

    if (normalizePostFalloff) {
      const range = Math.max(maxHeight - minHeight, 1);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          noiseMap[x][y] = (noiseMap[x][y] - minHeight) / range;
        }
      }
    }
  },

  normalizeMap(noiseMap, width, height, method, persistence, octaves, minNoiseHeight, maxNoiseHeight) {
    if (method === 'global') {
      let amplitude = 1;
      let maxPossibleHeight = 0;
      for (let i = 0; i < octaves; i++) {
        maxPossibleHeight += amplitude;
        amplitude *= persistence;
      }
      const factor = maxPossibleHeight / 0.9;
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          noiseMap[x][y] = Math.max(0, (noiseMap[x][y] + 1) / factor);
        }
      }
    } else {
      const range = Math.max(maxNoiseHeight - minNoiseHeight, 1);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          noiseMap[x][y] = (noiseMap[x][y] - minNoiseHeight) / range;
        }
      }
    }
  },

  renderTerrain(noiseMap, width, height, renderMode, heightScale) {
    const el = this.el;
    if (renderMode === 'noiseMap') {
      const texture = this.textureFromHeightMap(noiseMap, width, height);
      el.setAttribute('material', { src: texture });
      el.setAttribute('geometry', { primitive: 'plane', width: width - 1, height: height - 1 });
    } else if (renderMode === 'colorMap') {
      const texture = this.createColorMapTexture(noiseMap, width, height);
      el.setAttribute('material', { src: texture });
      el.setAttribute('geometry', { primitive: 'plane', width: width - 1, height: height - 1 });
    } else if (renderMode === 'mesh') {
      const texture = this.createColorMapTexture(noiseMap, width, height);
      const geometry = this.generateTerrainMesh(noiseMap, width, height, heightScale);
      const material = new THREE.MeshStandardMaterial({ map: texture, side: THREE.DoubleSide });
      const mesh = new THREE.Mesh(geometry, material);
      el.setObject3D('mesh', mesh);
      el.classList.add('ground');
      
      if (this.data.enablePhysics) {
        el.setAttribute('ammo-body', { type: 'static', emitCollisionEvents: true });
        el.setAttribute('ammo-shape', { type: 'mesh' });
      }
    }
  },

  createColorMapTexture(noiseMap, width, height) {
    const regions = this.parseJSON(this.data.terrainRegions, [], 'Invalid regions JSON');
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let y = 0, i = 0; y < height; y++) {
      for (let x = 0; x < width; x++, i += 4) {
        const h = noiseMap[x][y];
        let color = { r: 0, g: 0, b: 0 };
        
        if (regions.length > 0) {
          if (h <= regions[0].height) {
            color = this.hexToRGB(regions[0].color);
          } else if (h >= regions[regions.length - 1].height) {
            color = this.hexToRGB(regions[regions.length - 1].color);
          } else {
            for (let j = 1; j < regions.length; j++) {
              if (h <= regions[j].height) {
                const lower = regions[j - 1];
                const upper = regions[j];
                const t = (h - lower.height) / (upper.height - lower.height);
                color = this.lerpColor(this.hexToRGB(lower.color), this.hexToRGB(upper.color), t);
                break;
              }
            }
          }
        }
        
        data[i] = color.r;
        data[i + 1] = color.g;
        data[i + 2] = color.b;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return this.createTexture(canvas);
  },

  hexToRGB(hex) {
    const val = parseInt(hex.slice(1), 16);
    return { r: (val >> 16) & 255, g: (val >> 8) & 255, b: val & 255 };
  },

  lerpColor(a, b, t) {
    return {
      r: Math.round(a.r + t * (b.r - a.r)),
      g: Math.round(a.g + t * (b.g - a.g)),
      b: Math.round(a.b + t * (b.b - a.b))
    };
  },

  generateTerrainMesh(noiseMap, width, height, heightScale) {
    const lod = (this.currentDetailLevel !== undefined) ? this.currentDetailLevel : 0;
    const step = lod === 0 ? 1 : lod * 2;
  
    const vertsPerLine = Math.floor((width - 1) / step) + 1;
    const vertices = new Float32Array(vertsPerLine * vertsPerLine * 3);
    const uvs = new Float32Array(vertsPerLine * vertsPerLine * 2);
    const indices = new Uint32Array((vertsPerLine - 1) * (vertsPerLine - 1) * 6);
  
    for (let j = 0, v = 0, u = 0; j < vertsPerLine; j++) {
      const sampleY = j === vertsPerLine - 1 ? height - 1 : j * step;
      for (let i = 0; i < vertsPerLine; i++) {
        const sampleX = i === vertsPerLine - 1 ? width - 1 : i * step;
        const normalizedH = noiseMap[sampleX][sampleY];
        const h = this.evaluateMeshHeightCurve(normalizedH) * heightScale;
  
        vertices[v++] = sampleX;
        vertices[v++] = h;
        vertices[v++] = sampleY;
  
        uvs[u++] = sampleX / (width - 1);
        uvs[u++] = 1 - sampleY / (height - 1);
      }
    }
  
    // Generate indices
    let idx = 0;
    for (let y = 0; y < vertsPerLine - 1; y++) {
      for (let x = 0; x < vertsPerLine - 1; x++) {
        const i = y * vertsPerLine + x;
        const a = i;
        const b = i + vertsPerLine + 1;
        const c = i + vertsPerLine;
        const d = i + 1;
  
        indices[idx++] = a;
        indices[idx++] = b;
        indices[idx++] = c;
        indices[idx++] = b;
        indices[idx++] = a;
        indices[idx++] = d;
      }
    }
  
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
    geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    geometry.computeVertexNormals();
    return geometry;
  },

  createTexture(canvas) {
    const texture = new THREE.CanvasTexture(canvas);
    const filter = this.data.textureFilter === 'nearest' ? THREE.NearestFilter : THREE.LinearFilter;
    texture.minFilter = filter;
    texture.magFilter = filter;
    return texture;
  },

  textureFromHeightMap(noiseMap, width, height) {
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    for (let y = 0, i = 0; y < height; y++) {
      for (let x = 0; x < width; x++, i += 4) {
        const color = Math.floor(noiseMap[x][y] * 255);
        data[i] = data[i + 1] = data[i + 2] = color;
        data[i + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return new THREE.CanvasTexture(canvas);
  },

  evaluateMeshHeightCurve(value) {
    const kf = this.keyframes;
    if (value <= kf[0][0]) return kf[0][1];
    for (let i = 1; i < kf.length; i++) {
      if (value <= kf[i][0]) {
        const [lowT, lowVal] = kf[i - 1];
        const [highT, highVal] = kf[i];
        const t = this.smoothStep((value - lowT) / (highT - lowT));
        return lowVal + t * (highVal - lowVal);
      }
    }
    return kf[kf.length - 1][1];
  },

  smoothStep(t) {
    return t * t * (3 - 2 * t);
  },

  updateDetailLevel(cameraPosition) {
    if (!this.data || typeof this.data.chunkX === 'undefined') {
      return;
    }
    const chunkCenterX =
      this.data.chunkX * (this.data.chunkWidth - 1) + (this.data.chunkWidth - 1) / 2;
    const chunkCenterY =
      this.data.chunkY * (this.data.chunkHeight - 1) + (this.data.chunkHeight - 1) / 2;
    const distance = Math.sqrt(
      Math.pow(cameraPosition.x - chunkCenterX, 2) +
      Math.pow(cameraPosition.z - chunkCenterY, 2)
    );
  
    let computedLevel;
    try {
      const thresholds = JSON.parse(this.data.detailLevel);
      for (let i = 0; i < thresholds.length; i++) {
        const range = thresholds[i][0];
        const level = thresholds[i][1];
        if (distance <= range) {
          computedLevel = level;
          break;
        }
      }
      if (computedLevel === undefined) {
        computedLevel = thresholds[thresholds.length - 1][1];
      }
    } catch (e) {
      console.error("Error parsing detailLevel thresholds", e);
      return;
    }
  
    if (this.currentDetailLevel !== computedLevel) {
      this.currentDetailLevel = computedLevel;
      this.regenerateMesh();
    }
  },
  
  regenerateMesh() {
    const { chunkWidth: width, chunkHeight: height, renderMode, heightScale } = this.data;
    const noiseMap = new Array(width).fill().map(() => new Float32Array(height));
    this.generateMap();
  }

});
