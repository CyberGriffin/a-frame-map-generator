function generateFalloffMap(size) {
    const map = new Array(size);
    for (let i = 0; i < size; i++) {
      map[i] = new Array(size);
      for (let j = 0; j < size; j++) {
        const x = (i / (size - 1)) * 2 - 1;
        const y = (j / (size - 1)) * 2 - 1;
        const value = Math.max(Math.abs(x), Math.abs(y));
        map[i][j] = evaluateFalloff(value);
      }
    }
    return map;
  }
  
  function evaluateFalloff(value) {
    const a = 3;  // Steepness
    const b = 2.2; // Curve shape
    return Math.pow(value, a) / (Math.pow(value, a) + Math.pow(b - b * value, a));
  }