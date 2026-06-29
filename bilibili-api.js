// Bilibili search + playback API — zero-auth, works without login
const https = require('https');
const http = require('http');
const { getPlatformUA } = require('./server/utils');
const UA = getPlatformUA();

const BILIBILI_SEARCH_API = 'https://api.bilibili.com/x/web-interface/wbi/search/type';
const BILIBILI_PLAYURL_API = 'https://api.bilibili.com/x/player/playurl';

function biliRequest(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === 'https:' ? https : http;
    const req = mod.request(url, {
      method: opts.method || 'GET',
      headers: {
        'User-Agent': UA,
        'Referer': 'https://www.bilibili.com/',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'zh-CN,zh;q=0.9',
        ...opts.headers,
      },
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { resolve({ code: -1, data: null }); }
      });
    });
    req.on('error', (e) => reject(e));
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
    if (opts.body) req.write(opts.body);
    req.end();
  });
}

async function searchBilibili(keyword, limit = 15) {
  const params = new URLSearchParams({
    keyword, search_type: 'video', order: 'totalrank', page: 1,
  });
  const url = `${BILIBILI_SEARCH_API}?${params.toString()}`;
  const result = await biliRequest(url);
  if (!result || result.code !== 0 || !result.data || !result.data.result) {
    return { songs: [], total: 0 };
  }
  const items = result.data.result.slice(0, limit).map(item => ({
    id: item.bvid || String(item.aid || ''),
    bvid: item.bvid || '',
    aid: String(item.aid || ''),
    name: item.title?.replace(/<[^>]+>/g, '').trim() || '未知',
    artist: (item.author || '').trim(),
    album: '',
    albumId: '',
    cover: item.pic ? item.pic.replace(/^\/\//, 'https://') : '',
    duration: Math.round((item.duration || 0)),
    play: item.play || 0,
    danmaku: item.video_review || 0,
    typeName: item.typename || '',
    source: 'bilibili', provider: 'bilibili',
  }));
  return { songs: items, total: result.data.numResults || items.length };
}

async function getBilibiliPlayUrl(bvid, aid) {
  const cid = await getBilibiliCid(bvid || aid);
  if (!cid) return '';
  const params = new URLSearchParams({ bvid: bvid || '', avid: aid || '', cid, qn: '0', fnval: '4048', fourk: '1' });
  const url = `${BILIBILI_PLAYURL_API}?${params.toString()}`;
  const result = await biliRequest(url, { headers: { 'Referer': 'https://www.bilibili.com/video/' + (bvid || aid) } });
  if (!result || result.code !== 0 || !result.data) return '';
  const dash = result.data.dash || result.data.durl;
  if (!dash) return '';
  const audios = dash.audio || (Array.isArray(dash) ? dash : []);
  if (audios.length) return (audios[0].baseUrl || audios[0].base_url || audios[0].url || '').replace(/^\/\//, 'https://');
  const videos = dash.video || dash;
  const best = (Array.isArray(videos) ? videos : [videos]).sort((a, b) => (b.bandwidth || 0) - (a.bandwidth || 0))[0];
  return (best?.baseUrl || best?.base_url || best?.url || '').replace(/^\/\//, 'https://');
}

async function getBilibiliCid(vid) {
  const url = `https://api.bilibili.com/x/web-interface/view?bvid=${vid}`;
  const result = await biliRequest(url);
  if (!result || result.code !== 0 || !result.data) return null;
  return String(result.data.cid || (result.data.pages?.[0]?.cid) || '');
}

module.exports = { searchBilibili, getBilibiliPlayUrl, getBilibiliCid };
