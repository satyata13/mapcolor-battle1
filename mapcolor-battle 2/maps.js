/* maps.js — map definitions, adjacency lists and SVG geometry.
 *
 * Every map is drawn on a coarse lattice (one character = one cell, '.' = sea / outside).
 * The lattice is turned into one smooth SVG path per region by buildMapGeometry().
 * Each map also stores an explicit adjacency list (the CSP constraint graph). The test
 * suite checks that the adjacency list matches the borders actually drawn on the lattice,
 * so the picture and the constraints can never disagree.
 * All three maps are simplified: shapes are approximate and tiny regions are enlarged.
 */
const MAPS = {
  australia: {
    id: 'australia',
    name: 'Australia',
    tagline: '6 states + Northern Territory',
    note: 'Simplified map · ACT is not shown separately',
    cell: [10, 11],
    labelNames: true,
    regions: {
      WA: 'Western Australia', NT: 'Northern Territory', SA: 'South Australia', QLD: 'Queensland',
      NSW: 'New South Wales', VIC: 'Victoria', TAS: 'Tasmania'
    },
    key: { W: 'WA', N: 'NT', S: 'SA', Q: 'QLD', E: 'NSW', V: 'VIC', T: 'TAS' },
    grid: [
      '.............................Q...........',
      '.................NNNNNNN.....QQ..........',
      '................NNNNNNNN.....QQ..........',
      '................NNNNNNNN.....QQQ.........',
      '............WWWWNNNNNNNN.....QQQ.........',
      '...........WWWWWNNNNNNNN.....QQQ.........',
      '..........WWWWWWNNNNNNNNN...QQQQQ........',
      '.........WWWWWWWNNNNNNNNNQQQQQQQQQ.......',
      '.......WWWWWWWWWNNNNNNNNNQQQQQQQQQ.......',
      '.....WWWWWWWWWWWNNNNNNNNNQQQQQQQQQQ......',
      '..WWWWWWWWWWWWWWNNNNNNNNNQQQQQQQQQQQ.....',
      '.WWWWWWWWWWWWWWWNNNNNNNNNQQQQQQQQQQQQ....',
      'WWWWWWWWWWWWWWWWNNNNNNNNNQQQQQQQQQQQQQ...',
      'WWWWWWWWWWWWWWWWNNNNNNNNNQQQQQQQQQQQQQQ..',
      'WWWWWWWWWWWWWWWWNNNNNNNNNQQQQQQQQQQQQQQQ.',
      'WWWWWWWWWWWWWWWWNNNNNNNNNQQQQQQQQQQQQQQQ.',
      'WWWWWWWWWWWWWWWWSSSSSSSSSSSSQQQQQQQQQQQQQ',
      'WWWWWWWWWWWWWWWWSSSSSSSSSSSSQQQQQQQQQQQQQ',
      'WWWWWWWWWWWWWWWWSSSSSSSSSSSSQQQQQQQQQQQQQ',
      '.WWWWWWWWWWWWWWWSSSSSSSSSSSSEEEEEEEEEEEEE',
      '.WWWWWWWWWWWWWWWSSSSSSSSSSSSEEEEEEEEEEEEE',
      '.WWWWWWWWWWWWWWW..SSSSSSSSSSEEEEEEEEEEEEE',
      '..WWWWWWWWWWWWWW.....SSSSSSSEEEEEEEEEEEE.',
      '..WWWWWWWWWWWWW.......SSSSSSEEEEEEEEEEE..',
      '..WWWWWWWWWW............SSSSVVVEEEEEEEE..',
      '.........................SSSVVVVVVEEEE...',
      '..........................SSVVVVVVVVEE...',
      '...........................SVVVVVVVVV....',
      '.............................VVVVVV......',
      '.........................................',
      '................................TTTT.....',
      '...............................TTTTT.....',
      '...............................TTTTT.....',
      '................................TTT......'
    ],
    adjacency: {
      WA: ['NT', 'SA'],
      NT: ['WA', 'SA', 'QLD'],
      SA: ['WA', 'NT', 'QLD', 'NSW', 'VIC'],
      QLD: ['NT', 'SA', 'NSW'],
      NSW: ['QLD', 'SA', 'VIC'],
      VIC: ['SA', 'NSW'],
      TAS: []
    }
  },

  india: {
    id: 'india',
    name: 'India',
    tagline: '20 states + 3 grouped regions',
    note: 'Simplified map · J&K+Ladakh, Haryana+Delhi and the 7 North-East states are grouped; Goa & Sikkim enlarged',
    cell: [10, 10],
    labelNames: false,
    regions: {
      JK: 'Jammu, Kashmir & Ladakh', HP: 'Himachal Pradesh', PB: 'Punjab', HR: 'Haryana & Delhi',
      UK: 'Uttarakhand', UP: 'Uttar Pradesh', RJ: 'Rajasthan', GJ: 'Gujarat', MP: 'Madhya Pradesh',
      BR: 'Bihar', JH: 'Jharkhand', WB: 'West Bengal', SK: 'Sikkim', NE: 'North-East (7 states)',
      OD: 'Odisha', CG: 'Chhattisgarh', MH: 'Maharashtra', GA: 'Goa', TG: 'Telangana',
      AP: 'Andhra Pradesh', KA: 'Karnataka', KL: 'Kerala', TN: 'Tamil Nadu'
    },
    key: {
      J: 'JK', h: 'HP', P: 'PB', H: 'HR', T: 'UK', U: 'UP', R: 'RJ', G: 'GJ', M: 'MP', B: 'BR', j: 'JH', W: 'WB',
      s: 'SK', N: 'NE', O: 'OD', C: 'CG', m: 'MH', t: 'TG', A: 'AP', g: 'GA', K: 'KA', k: 'KL', n: 'TN'
    },
    grid: [
      '......JJJJJ..................',
      '.....JJJJJJJ.................',
      '....JJJJJJJJJ................',
      '....JJJJJJJJJ................',
      '.....JJJJJJJ.................',
      '......PPPhhh.................',
      '.....PPPPhhTT................',
      '...RRPPPHHUTTT............NNN',
      '..RRRRRRHHUUUTT.....s...NNNNN',
      '.RRRRRRRRHUUUUU.....s...NNNNN',
      '.RRRRRRRRUUUUUUUBBBWWNNNNNNNN',
      '.RRRRRRRMMUUUUUUBBBBW..NNNNNN',
      '..RRRRRRMMMMMUUUjjBBW..NNNNNN',
      'GGGGGRRRMMMMMMCCjjjWW..NNN...',
      'GGGGGGMMMMMMMMCCjjjWW..NNN...',
      '.GGGGGMMMMMMCCCOOOOWW........',
      '..GGGmmmmmmmCCCOOOO..........',
      '....mmmmmmtttCCOOO...........',
      '....mmmmmmtttCOOO............',
      '....mmmmKttttAAAA............',
      '....mmmKKKttAAAA.............',
      '....ggKKKKKAAAA..............',
      '.....KKKKKAAAA...............',
      '.....KKKKKAAAA...............',
      '......kKKKnnn................',
      '......kkKnnnn................',
      '......kknnnn.................',
      '.......knnnn.................',
      '.......knn...................'
    ],
    adjacency: {
      JK: ['HP', 'PB'],
      HP: ['JK', 'PB', 'HR', 'UK', 'UP'],
      PB: ['JK', 'HP', 'HR', 'RJ'],
      HR: ['PB', 'HP', 'UP', 'RJ'],
      UK: ['HP', 'UP'],
      UP: ['UK', 'HP', 'HR', 'RJ', 'MP', 'CG', 'JH', 'BR'],
      RJ: ['PB', 'HR', 'UP', 'MP', 'GJ'],
      GJ: ['RJ', 'MP', 'MH'],
      MP: ['RJ', 'UP', 'CG', 'MH', 'GJ'],
      BR: ['UP', 'JH', 'WB'],
      JH: ['BR', 'UP', 'CG', 'OD', 'WB'],
      WB: ['BR', 'JH', 'OD', 'SK', 'NE'],
      SK: ['WB'],
      NE: ['WB'],
      OD: ['WB', 'JH', 'CG', 'AP'],
      CG: ['UP', 'MP', 'MH', 'TG', 'AP', 'OD', 'JH'],
      MH: ['GJ', 'MP', 'CG', 'TG', 'KA', 'GA'],
      GA: ['MH', 'KA'],
      TG: ['MH', 'CG', 'AP', 'KA'],
      AP: ['TG', 'CG', 'OD', 'KA', 'TN'],
      KA: ['GA', 'MH', 'TG', 'AP', 'TN', 'KL'],
      KL: ['KA', 'TN'],
      TN: ['KL', 'KA', 'AP']
    }
  },

  usa: {
    id: 'usa',
    name: 'USA',
    tagline: '22 states west of the Mississippi',
    note: 'Simplified map · contiguous states west of the Mississippi River; corner-only contacts (Four Corners) are not borders',
    cell: [10, 12.5],
    labelNames: false,
    regions: {
      WA: 'Washington', OR: 'Oregon', CA: 'California', NV: 'Nevada', ID: 'Idaho', MT: 'Montana',
      WY: 'Wyoming', UT: 'Utah', CO: 'Colorado', AZ: 'Arizona', NM: 'New Mexico', ND: 'North Dakota',
      SD: 'South Dakota', NE: 'Nebraska', KS: 'Kansas', OK: 'Oklahoma', TX: 'Texas', MN: 'Minnesota',
      IA: 'Iowa', MO: 'Missouri', AR: 'Arkansas', LA: 'Louisiana'
    },
    key: {
      W: 'WA', O: 'OR', C: 'CA', N: 'NV', I: 'ID', M: 'MT', Y: 'WY', U: 'UT', L: 'CO', A: 'AZ', X: 'NM',
      D: 'ND', S: 'SD', E: 'NE', K: 'KS', H: 'OK', T: 'TX', n: 'MN', i: 'IA', o: 'MO', r: 'AR', l: 'LA'
    },
    grid: [
      '.WWWWWWWIMMMMMMMMMMMMDDDDDDDDnnnnnnn',
      '.WWWWWWWIMMMMMMMMMMMMDDDDDDDDnnnnnn.',
      '.WWWWWWWIIMMMMMMMMMMMDDDDDDDDnnnn...',
      '.OOOOOOOIIMMMMMMMMMMMSSSSSSSSnnnnn..',
      '.OOOOOOOIIIIIIYYYYYYYSSSSSSSSnnnnn..',
      '.OOOOOOOIIIIIIYYYYYYYSSSSSSSSnnnnn..',
      '.OOOOOOOIIIIIIYYYYYYYEEEEEEEiiiiiii.',
      '.CCCCNNNNNNUUUYYYYYYYEEEEEEEEiiiiii.',
      '.CCCCNNNNNNUUUUULLLLLLLEEEEEEEiiiii.',
      '.CCCCNNNNNNUUUUULLLLLLLKKKKKKooooooo',
      '.CCCCCNNNNNUUUUULLLLLLLKKKKKKKoooooo',
      '..CCCCCNNNNUUUUULLLLLLLKKKKKKKoooooo',
      '...CCCCCNNNAAAAAXXXXXXHHHHHHHHHrrrro',
      '....CCCCCNNAAAAAXXXXXXTTTHHHHHHrrrr.',
      '.....CCCCCAAAAAAXXXXXXTTTHHHHHHrrrr.',
      '......CCCCAAAAAAXXXXXXTTTTTTTTTrrrr.',
      '.......CCCAAAAAAXXXXXXTTTTTTTTTlll..',
      '...........AAAAAXXXTTTTTTTTTTTTlll..',
      '....................TTTTTTTTTTTllll.',
      '.....................TTTTTTTTTTlllll',
      '.......................TTTTTTT......',
      '........................TTTTT.......',
      '.........................TTTT.......',
      '...........................TT.......'
    ],
    adjacency: {
      WA: ['OR', 'ID'],
      OR: ['WA', 'ID', 'NV', 'CA'],
      CA: ['OR', 'NV', 'AZ'],
      NV: ['OR', 'CA', 'AZ', 'UT', 'ID'],
      ID: ['WA', 'OR', 'NV', 'UT', 'WY', 'MT'],
      MT: ['ID', 'WY', 'SD', 'ND'],
      WY: ['MT', 'ID', 'UT', 'CO', 'NE', 'SD'],
      UT: ['ID', 'NV', 'AZ', 'CO', 'WY'],
      CO: ['WY', 'UT', 'NM', 'OK', 'KS', 'NE'],
      AZ: ['CA', 'NV', 'UT', 'NM'],
      NM: ['AZ', 'CO', 'OK', 'TX'],
      ND: ['MT', 'SD', 'MN'],
      SD: ['ND', 'MT', 'WY', 'NE', 'IA', 'MN'],
      NE: ['SD', 'WY', 'CO', 'KS', 'MO', 'IA'],
      KS: ['NE', 'CO', 'OK', 'MO'],
      OK: ['KS', 'CO', 'NM', 'TX', 'AR', 'MO'],
      TX: ['NM', 'OK', 'AR', 'LA'],
      MN: ['ND', 'SD', 'IA'],
      IA: ['MN', 'SD', 'NE', 'MO'],
      MO: ['IA', 'NE', 'KS', 'OK', 'AR'],
      AR: ['MO', 'OK', 'TX', 'LA'],
      LA: ['TX', 'AR']
    }
  }
};

/** Region id stored in a lattice cell, or null for sea / outside the grid. */
function cellRegion(map, r, c) {
  const row = map.grid[r];
  return row && c >= 0 && c < row.length ? map.key[row[c]] || null : null;
}

/** Adjacency derived from the drawing: two regions are neighbours when their cells share an edge. */
function deriveGridAdjacency(map) {
  const adj = {};
  Object.keys(map.regions).forEach(id => { adj[id] = new Set(); });
  map.grid.forEach((row, r) => {
    for (let c = 0; c < row.length; c++) {
      const a = cellRegion(map, r, c);
      if (!a) continue;
      [cellRegion(map, r, c + 1), cellRegion(map, r + 1, c)].forEach(b => {
        if (b && b !== a) { adj[a].add(b); adj[b].add(a); }
      });
    }
  });
  return adj;
}

/**
 * Converts the lattice into SVG geometry: one path per region plus a label anchor.
 * Region outlines are traced cell edge by cell edge, reduced to corner points, then rounded
 * with Chaikin corner cutting. Lattice points where three or more areas meet stay fixed, so the
 * two sides of every shared border are smoothed identically and neighbouring paths fit together.
 */
function buildMapGeometry(map) {
  const [cw, ch] = map.cell;
  const rows = map.grid.length;
  const cols = map.grid[0].length;
  const at = (r, c) => cellRegion(map, r, c);
  const isJunction = ([x, y]) => {
    const q = [at(y - 1, x - 1), at(y - 1, x), at(y, x), at(y, x - 1)];
    const distinct = new Set(q).size;
    return distinct > 2 || (distinct === 2 && q[0] === q[2] && q[1] === q[3]);
  };

  const regions = {};
  for (const id of Object.keys(map.regions)) {
    const edges = new Map();
    const cells = [];
    const addEdge = (x1, y1, x2, y2) => {
      const k = x1 + ',' + y1;
      if (!edges.has(k)) edges.set(k, []);
      edges.get(k).push([x2, y2]);
    };
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (at(r, c) !== id) continue;
        cells.push([r, c]);
        if (at(r - 1, c) !== id) addEdge(c, r, c + 1, r);
        if (at(r, c + 1) !== id) addEdge(c + 1, r, c + 1, r + 1);
        if (at(r + 1, c) !== id) addEdge(c + 1, r + 1, c, r + 1);
        if (at(r, c - 1) !== id) addEdge(c, r + 1, c, r);
      }
    }

    const loops = [];
    while (edges.size) {
      const startKey = edges.keys().next().value;
      const loop = [];
      let key = startKey;
      do {
        const pt = key.split(',').map(Number);
        loop.push(pt);
        const outs = edges.get(key);
        const next = outs.pop();
        if (!outs.length) edges.delete(key);
        key = next[0] + ',' + next[1];
      } while (key !== startKey);
      loops.push(smoothLoop(loop.filter((p, i) => {
        const a = loop[(i - 1 + loop.length) % loop.length];
        const b = loop[(i + 1) % loop.length];
        const straight = (p[0] - a[0]) * (b[1] - p[1]) === (p[1] - a[1]) * (b[0] - p[0]);
        return !straight || isJunction(p);
      }), isJunction));
    }

    const d = loops.map(loop => 'M' + loop.map(([x, y]) => (x * cw).toFixed(1) + ',' + (y * ch).toFixed(1)).join('L') + 'Z').join('');

    // Label anchor: the region's own cell closest to its centroid (stays inside concave shapes).
    const cr = cells.reduce((s, [r]) => s + r, 0) / cells.length;
    const cc = cells.reduce((s, [, c]) => s + c, 0) / cells.length;
    const [lr, lc] = cells.reduce((best, cell) =>
      Math.hypot(cell[0] - cr, cell[1] - cc) < Math.hypot(best[0] - cr, best[1] - cc) ? cell : best);
    regions[id] = { d, labelX: (lc + 0.5) * cw, labelY: (lr + 0.5) * ch, cells: cells.length };
  }
  return { width: cols * cw, height: rows * ch, regions };
}

/**
 * Corner cutting with fixed points kept exactly. The first pass cuts every corner by up to half a
 * cell (unit staircase steps collapse onto their midpoints, i.e. a straight diagonal); two Chaikin
 * passes then round what is left. Each new point depends only on one edge, so both sides of a
 * shared border produce the same points.
 */
function smoothLoop(points, isFixed) {
  let pts = points.map(p => ({ x: p[0], y: p[1], fixed: isFixed(p) }));
  const same = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y) < 1e-9;
  for (let pass = 0; pass < 3; pass++) {
    const out = [];
    pts.forEach((p, i) => {
      if (p.fixed) { out.push(p); return; }
      [pts[(i - 1 + pts.length) % pts.length], pts[(i + 1) % pts.length]].forEach(q => {
        const t = pass === 0 ? Math.min(0.5, 0.5 / Math.hypot(q.x - p.x, q.y - p.y)) : 0.25;
        const pt = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
        if (!out.length || !same(out[out.length - 1], pt)) out.push(pt);
      });
    });
    if (out.length > 1 && same(out[0], out[out.length - 1])) out.pop();
    pts = out;
  }
  return pts.map(p => [p.x, p.y]);
}

if (typeof module !== 'undefined') module.exports = { MAPS, deriveGridAdjacency, buildMapGeometry };
