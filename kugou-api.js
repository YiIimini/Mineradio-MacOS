// Kugou search API — public, no login required
const https = require('https');
const http = require('http');
const crypto = require('crypto');

function kgRequest(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: opts.method || 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json, text/plain, */*',
        ...opts.headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve(null); }
      });
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

function generateKgParams(keyword, page = 1, pagesize = 15) {
  const dfid = crypto.randomBytes(16).toString('hex').slice(0, 32);
  const mid = crypto.randomBytes(4).toString('hex');
  return {
    keyword, page: String(page), pagesize: String(pagesize),
    platform: 'WebFilter', format: 'json',
    dfid, mid,
  };
}

async function searchKugou(keyword, page = 1, pagesize = 15) {
  const params = generateKgParams(keyword, page, pagesize);
  const qs = new URLSearchParams(params).toString();
  const url = `https://complexsearch.kugou.com/v2/search/song?${qs}`;
  const result = await kgRequest(url);
  if (!result || result.status !== 1 || !result.data || !result.data.lists) {
    return { songs: [], total: 0 };
  }
  const songs = result.data.lists.map(item => ({
    id: item.EMixSongID || item.SongID || item.FileHash || '',
    hash: item.FileHash || item.HQFileHash || item.SQFileHash || '',
    name: (item.SongName || '').trim(),
    artist: (item.SingerName || '').trim().replace(/、/g, ', '),
    album: (item.AlbumName || '').trim(),
    albumId: item.AlbumID || '',
    cover: item.Image ? item.Image.replace(/\/\{size\}$/, '/400') : '',
    duration: Math.round((item.Duration || 0)),
    source: 'kugou', provider: 'kugou',
  }));
  return { songs, total: result.data.total || songs.length };
}

async function getKugouPlayUrl(hash) {
  if (!hash) return '';
  const url = `https://wwwapi.kugou.com/yy/index.php?r=play/getdata&hash=${hash}&mid=auto&platid=4`;
  const result = await kgRequest(url);
  if (!result || result.status !== 1 || !result.data) return '';
  return result.data.play_url || result.data.play_backup_url || '';
}

module.exports = { searchKugou, getKugouPlayUrl };
