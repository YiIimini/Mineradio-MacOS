// Mineradio QQ Music provider — search, playback, login, playlists, comments, lyrics
const https = require('https');
const http = require('http');
const fs   = require('fs');
const path = require('path');
const { parseCookieString, serializeCookieObject, normalizeCookieHeader, parseJSONText, clampNumber, getPlatformUA } = require('./utils');

// --- QQ cookie state ---
let qqCookie = '';
const QQ_COOKIE_FILE = process.env.QQ_COOKIE_FILE || path.join(__dirname, '..', '.qq-cookie');
try { if (fs.existsSync(QQ_COOKIE_FILE)) qqCookie = fs.readFileSync(QQ_COOKIE_FILE, 'utf8').trim(); } catch (e) { qqCookie = ''; }

function getQQCookie() { return qqCookie; }
function setQQCookie(c) {
  qqCookie = normalizeCookieHeader(c) || c;
  try { fs.writeFileSync(QQ_COOKIE_FILE, qqCookie); } catch (e) {}
}

// --- Constants ---
const UA = getPlatformUA();

const QQ_MUSICU_URL = 'https://u.y.qq.com/cgi-bin/musicu.fcg';
const QQ_SMARTBOX_URL = 'https://c.y.qq.com/splcloud/fcgi-bin/smartbox_new.fcg';
const QQ_HEADERS = { Referer: 'https://y.qq.com/', 'User-Agent': UA };

const QQ_QUALITY_CANDIDATE_TEMPLATES = [
  { prefix: 'RS01', ext: '.flac', level: 'hires', label: 'Hi-Res FLAC' },
  { prefix: 'F000', ext: '.flac', level: 'lossless', label: '无损 FLAC' },
  { prefix: 'M800', ext: '.mp3', level: 'exhigh', label: '320k MP3' },
  { prefix: 'M500', ext: '.mp3', level: 'standard', label: '128k MP3' },
  { prefix: 'C400', ext: '.m4a', level: 'aac', label: 'AAC/M4A' },
];

// --- HTTP helpers ---
function requestText(targetUrl, opts, body) {
  opts = opts || {};
  return new Promise((resolve, reject) => {
    const u = new URL(targetUrl);
    const lib = u.protocol === 'https:' ? https : http;
    const req = lib.request(u, { method: opts.method || 'GET', headers: opts.headers || {} }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (response.statusCode >= 400) {
          const err = new Error('HTTP ' + response.statusCode);
          err.statusCode = response.statusCode;
          err.body = text;
          reject(err);
          return;
        }
        resolve(text);
      });
    });
    req.setTimeout(10000, () => req.destroy(new Error('Request timeout')));
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function requestJson(targetUrl, opts, body) {
  const text = await requestText(targetUrl, opts, body);
  return parseJSONText(text);
}

// --- QQ Music API helpers ---
async function qqMusicRequest(payload, opts) {
  opts = opts || {};
  const body = JSON.stringify(payload);
  const headers = { ...QQ_HEADERS, 'Content-Type': 'application/json;charset=UTF-8', 'Content-Length': Buffer.byteLength(body) };
  if (opts.cookie && qqCookie) headers.Cookie = qqCookie;
  const text = await requestText(QQ_MUSICU_URL, { method: 'POST', headers }, body);
  return parseJSONText(text);
}

async function qqGetJSON(targetUrl, params, opts) {
  opts = opts || {};
  const u = new URL(targetUrl);
  Object.keys(params || {}).forEach(k => { if (params[k] != null) u.searchParams.set(k, String(params[k])); });
  const headers = { ...QQ_HEADERS, ...(opts.headers || {}) };
  if (opts.cookie !== false && qqCookie) headers.Cookie = qqCookie;
  const text = await requestText(u.toString(), { headers });
  return parseJSONText(text);
}

// --- Cookie parsing ---
function normalizeQQUin(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.replace(/^0+/, '') || digits;
}

function qqCookieObject() { return parseCookieString(qqCookie); }
function qqCookieUin(obj) {
  obj = obj || qqCookieObject();
  const raw = Number(obj.login_type) === 2 ? (obj.wxuin || obj.uin || obj.p_uin) : (obj.uin || obj.qqmusic_uin || obj.wxuin || obj.p_uin);
  return normalizeQQUin(raw);
}
function qqCookieMusicKey(obj) {
  obj = obj || qqCookieObject();
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.p_skey || obj.skey ||
    obj.psrf_qqaccess_token || obj.psrf_qqrefresh_token || obj.wxrefresh_token || obj.wxskey || '';
}
function qqCookiePlaybackKey(obj) {
  obj = obj || qqCookieObject();
  return obj.qm_keyst || obj.qqmusic_key || obj.music_key || obj.wxskey || '';
}
function decodeQQCookieValue(value) {
  try { return decodeURIComponent(String(value || '').replace(/\+/g, '%20')).trim(); }
  catch (e) { return String(value || '').trim(); }
}
function qqCookieNickname(obj, uin) {
  obj = obj || qqCookieObject();
  uin = normalizeQQUin(uin || qqCookieUin(obj));
  const padded = uin ? '0' + uin : '';
  const keys = [uin && ('ptnick_' + uin), padded && ('ptnick_' + padded), 'ptnick', 'nick', 'nickname', 'qq_nickname'].filter(Boolean);
  for (const key of keys) { if (obj[key]) { const nick = decodeQQCookieValue(obj[key]); if (nick) return nick; } }
  const ptnickKey = Object.keys(obj).find(key => /^ptnick_/i.test(key) && obj[key]);
  return ptnickKey ? decodeQQCookieValue(obj[ptnickKey]) : '';
}
function qqCookieAvatar(obj, uin) {
  obj = obj || qqCookieObject();
  const direct = obj.qqmusic_avatar || obj.avatar || obj.avatarUrl || obj.headpic || '';
  if (direct) return decodeQQCookieValue(direct);
  uin = normalizeQQUin(uin || qqCookieUin(obj));
  return uin ? `https://q1.qlogo.cn/g?b=qq&nk=${encodeURIComponent(uin)}&s=100` : '';
}
function normalizeQQCookieInput(cookieText) {
  const obj = parseCookieString(cookieText);
  if (Number(obj.login_type) === 2 && obj.wxuin && !obj.uin) obj.uin = obj.wxuin;
  if (!obj.uin && (obj.qqmusic_uin || obj.p_uin)) obj.uin = obj.qqmusic_uin || obj.p_uin;
  if (obj.uin) obj.uin = normalizeQQUin(obj.uin);
  return serializeCookieObject(obj);
}

// --- Playback restriction ---
function classifyQQPlaybackRestriction(info, session) {
  const hasSession = typeof session === 'object' ? !!session.hasSession : !!session;
  const hasPlaybackKey = typeof session === 'object' ? !!session.hasPlaybackKey : hasSession;
  const rawMsg = String((info && (info.msg || info.tips || info.errmsg || info.message)) || '').trim();
  const code = Number((info && (info.result || info.code || info.errtype)) || 0);
  const lower = rawMsg.toLowerCase();
  if (!hasSession) return { provider: 'qq', category: 'login_required', action: 'login', message: 'QQ 音乐需要登录或授权后才能获取播放地址', code, rawMessage: rawMsg };
  if (!hasPlaybackKey && code === 104003) return { provider: 'qq', category: 'login_required', action: 'login', message: 'QQ 音乐当前只拿到了网页登录状态，还缺少播放授权，请重新打开官方 QQ 音乐登录窗口完成授权', code, rawMessage: rawMsg, missingPlaybackKey: true };
  if (code === 104003) return { provider: 'qq', category: 'copyright_unavailable', action: 'switch_source', message: 'QQ 音乐没有给当前版本返回播放地址，通常是版权、会员或官方版本限制', code, rawMessage: rawMsg };
  if (/vip|会员|付费|购买|数字专辑|专辑|pay/.test(lower + rawMsg)) return { provider: 'qq', category: 'paid_required', action: 'upgrade', message: 'QQ 音乐歌曲需要会员、购买或数字专辑权限', code, rawMessage: rawMsg };
  if (code && code !== 0) return { provider: 'qq', category: 'copyright_unavailable', action: 'switch_source', message: rawMsg || 'QQ 音乐版权暂不可播或仅官方客户端可播', code, rawMessage: rawMsg };
  return { provider: 'qq', category: 'url_unavailable', action: 'switch_source', message: 'QQ 音乐没有返回播放地址，可能受版权、会员或官方客户端限制', code, rawMessage: rawMsg };
}

// --- Profile & login ---
function normalizeQQProfile(body, cookieObj) {
  cookieObj = cookieObj || qqCookieObject();
  const uin = qqCookieUin(cookieObj);
  const data = (body && (body.data || body.profile || body.creator || body.result)) || {};
  const creator = (data.creator || data.user || data.profile || data) || {};
  const vipInfo = data.vipInfo || data.vipinfo || data.vip || creator.vipInfo || creator.vipinfo || {};
  const profileNick = creator.nick || creator.nickname || creator.name || creator.hostname || creator.title || '';
  const profileAvatar = creator.headpic || creator.avatar || creator.avatarUrl || creator.logo || '';
  const cookieNick = qqCookieNickname(cookieObj, uin);
  const nick = profileNick || cookieNick || '';
  const avatar = profileAvatar || qqCookieAvatar(cookieObj, uin);
  let vipType = Number(
    cookieObj.vipType || cookieObj.vip_type ||
    data.vipType || data.vip_type || data.viptype || data.music_vip_level || data.green_vip_level || data.luxury_vip_level ||
    creator.vipType || creator.vip_type || creator.music_vip_level || creator.green_vip_level || creator.luxury_vip_level ||
    vipInfo.vipType || vipInfo.vip_type || vipInfo.music_vip_level || vipInfo.green_vip_level || vipInfo.luxury_vip_level || 0
  ) || 0;
  if (!vipType) {
    const vipFlag = data.isVip || data.is_vip || data.vipFlag || data.vipflag || creator.isVip || creator.is_vip || vipInfo.isVip || vipInfo.is_vip || vipInfo.vipFlag;
    if (vipFlag === true || Number(vipFlag) > 0 || String(vipFlag || '').toLowerCase() === 'true') vipType = 1;
  }
  return {
    provider: 'qq', loggedIn: !!(uin && qqCookieMusicKey(cookieObj)), preview: false,
    userId: uin, nickname: nick || (uin ? ('QQ ' + uin) : 'QQ 音乐'), avatar,
    vipType, hasCookie: !!qqCookie, playbackKeyReady: !!qqCookiePlaybackKey(cookieObj),
    profileSource: profileNick || profileAvatar ? 'qq-profile' : (cookieNick || avatar ? 'cookie' : 'fallback'),
  };
}

async function getQQLoginInfo() {
  const cookieObj = qqCookieObject();
  const uin = qqCookieUin(cookieObj);
  const musicKey = qqCookieMusicKey(cookieObj);
  if (!uin || !musicKey) return { provider: 'qq', loggedIn: false, hasCookie: !!qqCookie };
  const fallback = normalizeQQProfile(null, cookieObj);
  try {
    const u = new URL('https://c.y.qq.com/rsc/fcgi-bin/fcg_get_profile_homepage.fcg');
    u.searchParams.set('cid', '205360838'); u.searchParams.set('userid', uin); u.searchParams.set('reqfrom', '1');
    u.searchParams.set('g_tk', '5381'); u.searchParams.set('loginUin', uin); u.searchParams.set('hostUin', '0');
    u.searchParams.set('format', 'json'); u.searchParams.set('inCharset', 'utf8'); u.searchParams.set('outCharset', 'utf-8');
    u.searchParams.set('notice', '0'); u.searchParams.set('platform', 'yqq.json'); u.searchParams.set('needNewCode', '0');
    const text = await requestText(u.toString(), { headers: { ...QQ_HEADERS, Cookie: qqCookie } });
    const body = parseJSONText(text);
    const info = normalizeQQProfile(body, cookieObj);
    if (body && (body.code === 1000 || body.result === 301)) return { ...fallback, profileUnavailable: true };
    return info;
  } catch (e) { return { ...fallback, profileUnavailable: true }; }
}

function isQQFavoritePlaylist(pl) { return /我喜欢|我的喜欢|喜欢的音乐/i.test(String(pl && pl.name || '').trim()); }
function isQzoneBackgroundPlaylist(pl) { return /qzone|空间|背景音乐/i.test(String((pl && pl.name || '') + ' ' + (pl && pl.creator || '')).toLowerCase()); }

// --- Image helpers ---
function qqAlbumCover(albumMid, size) {
  if (!albumMid) return '';
  const px = size || 300;
  return 'https://y.qq.com/music/photo_new/T002R' + px + 'x' + px + 'M000' + albumMid + '.jpg?max_age=2592000';
}
function qqSingerAvatar(singerMid, size) {
  if (!singerMid) return '';
  const px = size || 300;
  return 'https://y.qq.com/music/photo_new/T001R' + px + 'x' + px + 'M000' + singerMid + '.jpg?max_age=2592000';
}
function mapQQArtists(raw) {
  return (raw || []).map(a => ({ id: a && a.id, mid: a && a.mid, name: (a && (a.name || a.title)) || '' })).filter(a => a.name);
}

// --- Playlist mapping ---
function mapQQPlaylist(pl, kind) {
  pl = pl || {};
  const id = pl.dissid || pl.tid || pl.dirid || pl.id || pl.diss_id;
  return {
    provider: 'qq', source: 'qq', id: id ? String(id) : '',
    name: pl.diss_name || pl.name || pl.title || '',
    cover: pl.diss_cover || pl.logo || pl.picurl || pl.cover || '',
    trackCount: pl.song_cnt || pl.songnum || pl.total_song_num || pl.song_count || 0,
    playCount: pl.listen_num || pl.visitnum || pl.play_count || 0,
    creator: pl.hostname || pl.nick || pl.creator || 'QQ 音乐',
    subscribed: kind === 'collect', specialType: 0,
  };
}

function mapQQPlaylistTrack(raw) {
  raw = raw || {};
  const track = raw.songid || raw.songmid || raw.mid || raw.name ? raw : (raw.track_info || raw.songInfo || raw.songinfo || raw.song || {});
  const album = track.album || {};
  const artists = mapQQArtists(track.singer || track.singers || []);
  const mid = track.mid || track.songmid || raw.mid || raw.songmid || '';
  const albumMid = album.mid || track.albummid || raw.albummid || '';
  return {
    provider: 'qq', source: 'qq', type: 'qq',
    id: mid || String(track.id || track.songid || raw.id || raw.songid || ''),
    qqId: track.id || track.songid || raw.id || raw.songid || '', mid, songmid: mid,
    mediaMid: (track.file && track.file.media_mid) || track.strMediaMid || track.media_mid || raw.strMediaMid || '',
    name: track.name || track.songname || raw.songname || '',
    artist: artists.map(a => a.name).join(' / ') || track.singername || raw.singername || '',
    artists, artistId: artists[0] && (artists[0].id || artists[0].mid), artistMid: artists[0] && artists[0].mid,
    album: album.name || album.title || track.albumname || raw.albumname || '',
    albumMid, cover: qqAlbumCover(albumMid, 300),
    duration: (Number(track.interval || raw.interval) || 0) * 1000,
    fee: track.pay && Number(track.pay.pay_play) ? 1 : 0, playable: false,
  };
}

async function handleQQUserPlaylists() {
  const info = await getQQLoginInfo();
  if (!info.loggedIn || !info.userId) return { loggedIn: false, provider: 'qq', playlists: [] };
  const uin = info.userId;
  const createdReq = qqGetJSON('https://c.y.qq.com/rsc/fcgi-bin/fcg_user_created_diss', {
    hostUin: 0, hostuin: uin, sin: 0, size: 200, g_tk: 5381, loginUin: uin,
    format: 'json', inCharset: 'utf8', outCharset: 'utf-8', notice: 0, platform: 'yqq.json', needNewCode: 0,
  }, { headers: { Referer: 'https://y.qq.com/portal/profile.html' } });
  const collectReq = qqGetJSON('https://c.y.qq.com/fav/fcgi-bin/fcg_get_profile_order_asset.fcg', {
    ct: 20, cid: 205360956, userid: uin, reqtype: 3, sin: 0, ein: 80,
  }, { headers: { Referer: 'https://y.qq.com/portal/profile.html' } });
  const [createdRaw, collectRaw] = await Promise.allSettled([createdReq, collectReq]);
  const created = createdRaw.status === 'fulfilled' && createdRaw.value && createdRaw.value.data && Array.isArray(createdRaw.value.data.disslist)
    ? createdRaw.value.data.disslist.map(pl => mapQQPlaylist(pl, 'created')) : [];
  const collected = collectRaw.status === 'fulfilled' && collectRaw.value && collectRaw.value.data && Array.isArray(collectRaw.value.data.cdlist)
    ? collectRaw.value.data.cdlist.map(pl => mapQQPlaylist(pl, 'collect')) : [];
  const seen = new Set();
  const playlists = created.concat(collected).filter(pl => {
    if (!pl.id || !pl.name || seen.has(pl.id)) return false;
    if (isQzoneBackgroundPlaylist(pl)) return false;
    seen.add(pl.id); return true;
  }).sort((a, b) => Number(isQQFavoritePlaylist(b)) - Number(isQQFavoritePlaylist(a)));
  return { loggedIn: true, provider: 'qq', userId: uin, playlists };
}

async function handleQQPlaylistTracks(id) {
  const info = await getQQLoginInfo();
  if (!info.loggedIn || !info.userId) return { loggedIn: false, provider: 'qq', tracks: [] };
  const pid = String(id || '').trim();
  if (!pid) return { loggedIn: true, provider: 'qq', error: 'Missing QQ playlist id', tracks: [] };
  const result = await qqGetJSON('https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg', {
    type: 1, utf8: 1, disstid: pid, loginUin: info.userId,
    format: 'json', inCharset: 'utf8', outCharset: 'utf-8', notice: 0, platform: 'yqq.json', needNewCode: 0,
  }, { headers: { Referer: 'https://y.qq.com/n/yqq/playlist' } });
  const detail = result && result.cdlist && result.cdlist[0] ? result.cdlist[0] : {};
  const rawTracks = Array.isArray(detail.songlist) ? detail.songlist : [];
  const tracks = rawTracks.map(mapQQPlaylistTrack).filter(s => s.name && (s.mid || s.id));
  const playlist = { provider: 'qq', id: pid, name: detail.dissname || detail.diss_name || detail.name || '', cover: detail.logo || detail.diss_cover || '', trackCount: tracks.length };
  return { loggedIn: true, provider: 'qq', playlist, tracks };
}

// --- Song mapping ---
function mapQQSmartSong(item) {
  item = item || {};
  const mid = item.mid || item.songmid || item.id || '';
  return { provider: 'qq', source: 'qq', type: 'qq', id: mid, qqId: item.id || item.docid || '', mid, songmid: mid, name: item.name || item.title || '', artist: item.singer || '', artists: item.singer ? [{ name: item.singer }] : [], album: '', cover: '', duration: 0, fee: 0, playable: false };
}

function mapQQTrack(track, fallback) {
  track = track || {}; fallback = fallback || {};
  const album = track.album || {};
  const artists = mapQQArtists(track.singer || []);
  const mid = track.mid || fallback.mid || fallback.songmid || '';
  const albumMid = album.mid || album.pmid || '';
  return {
    provider: 'qq', source: 'qq', type: 'qq', id: mid, qqId: track.id || fallback.qqId || fallback.id || '', mid, songmid: mid,
    mediaMid: track.file && track.file.media_mid,
    name: track.name || track.title || fallback.name || '',
    artist: artists.map(a => a.name).join(' / ') || fallback.artist || '',
    artists: artists.length ? artists : (fallback.artists || []),
    artistId: artists[0] && (artists[0].id || artists[0].mid), artistMid: artists[0] && artists[0].mid,
    album: album.name || album.title || fallback.album || '', albumMid,
    cover: qqAlbumCover(albumMid, 300) || fallback.cover || '',
    duration: (Number(track.interval) || 0) * 1000,
    fee: track.pay && Number(track.pay.pay_play) ? 1 : 0, playable: false,
  };
}

// --- Search ---
async function qqSmartboxSearch(keywords, limit) {
  const u = new URL(QQ_SMARTBOX_URL);
  u.searchParams.set('format', 'json'); u.searchParams.set('key', keywords); u.searchParams.set('g_tk', '5381');
  u.searchParams.set('loginUin', '0'); u.searchParams.set('hostUin', '0');
  u.searchParams.set('inCharset', 'utf8'); u.searchParams.set('outCharset', 'utf-8');
  u.searchParams.set('notice', '0'); u.searchParams.set('platform', 'yqq.json'); u.searchParams.set('needNewCode', '0');
  const text = await requestText(u.toString(), { headers: QQ_HEADERS });
  const json = parseJSONText(text);
  const items = json && json.data && json.data.song && json.data.song.itemlist;
  return (Array.isArray(items) ? items : []).slice(0, Math.max(1, Math.min(limit || 6, 10))).map(mapQQSmartSong);
}

async function qqSongDetail(mid, fallback) {
  if (!mid) return fallback;
  const json = await qqMusicRequest({
    comm: { ct: 24, cv: 0 },
    songinfo: { module: 'music.pf_song_detail_svr', method: 'get_song_detail_yqq', param: { song_mid: mid } },
  });
  const data = json && json.songinfo && json.songinfo.data;
  return mapQQTrack(data && data.track_info, fallback);
}

async function handleQQSearch(keywords, limit) {
  const kw = String(keywords || '').trim();
  if (!kw) return [];
  const base = await qqSmartboxSearch(kw, limit);
  const detailed = await Promise.all(base.map(async item => {
    try { return await qqSongDetail(item.mid, item); }
    catch (e) { return item; }
  }));
  const seen = new Set();
  return detailed.filter(song => {
    const key = song && (song.mid || song.id || (song.name + '|' + song.artist));
    if (!key || seen.has(key)) return false;
    seen.add(key); return !!song.name;
  });
}

// --- Song URL ---
function normalizeQualityPreference(value) {
  const raw = String(value || '').toLowerCase().trim();
  if (['jymaster', 'master', 'studio', 'svip'].includes(raw)) return 'jymaster';
  if (['hires', 'hi-res', 'highres', 'zhenyin', 'spatial'].includes(raw)) return 'hires';
  if (['lossless', 'flac', 'sq'].includes(raw)) return 'lossless';
  if (['exhigh', 'high', '320', '320k', 'hq'].includes(raw)) return 'exhigh';
  if (['standard', 'normal', '128', '128k', 'std'].includes(raw)) return 'standard';
  return 'hires';
}

function qualityCandidatesFrom(target, candidates) {
  target = normalizeQualityPreference(target);
  let start = candidates.findIndex(item => item.level === target);
  if (start < 0) start = 0;
  return candidates.slice(start);
}

async function handleQQSongUrl(mid, mediaMid, qualityPreference) {
  const songmid = String(mid || '').trim();
  if (!songmid) return { provider: 'qq', url: '', error: 'MISSING_MID', message: 'Missing QQ song mid' };
  const guid = String(10000000 + Math.floor(Math.random() * 90000000));
  const cookieObj = qqCookieObject();
  const uin = qqCookieUin(cookieObj) || '0';
  const musicKey = qqCookieMusicKey(cookieObj);
  const playbackKey = qqCookiePlaybackKey(cookieObj);
  const fileMediaMid = String(mediaMid || '').trim();
  const requestedQuality = normalizeQualityPreference(qualityPreference);
  const mediaIds = [];
  if (fileMediaMid) mediaIds.push(fileMediaMid);
  if (songmid && !mediaIds.includes(songmid)) mediaIds.push(songmid);
  const fileCandidates = mediaIds.flatMap(mediaId =>
    qualityCandidatesFrom(requestedQuality, QQ_QUALITY_CANDIDATE_TEMPLATES)
      .map(item => ({ ...item, mediaId, filename: item.prefix + mediaId + item.ext }))
  );
  const filenames = fileCandidates.map(item => item.filename);
  const param = { guid, songmid: filenames.length ? filenames.map(() => songmid) : [songmid], songtype: filenames.length ? filenames.map(() => 0) : [0], uin, loginflag: 1, platform: '20' };
  if (filenames.length) param.filename = filenames;
  const comm = { uin, format: 'json', ct: musicKey ? 19 : 24, cv: 0 };
  if (musicKey) comm.authst = musicKey;
  const json = await qqMusicRequest({ comm, req_0: { module: 'vkey.GetVkeyServer', method: 'CgiGetVkey', param } }, { cookie: true });
  const data = json && json.req_0 && json.req_0.data;
  const infos = (data && Array.isArray(data.midurlinfo)) ? data.midurlinfo : [];
  const info = infos.find(item => item && item.purl) || infos[0];
  const purl = info && info.purl;
  if (purl) {
    const sip = (data.sip && data.sip[0]) || 'https://ws.stream.qqmusic.qq.com/';
    const fileMeta = fileCandidates.find(item => item.filename === info.filename) || {};
    return { provider: 'qq', url: sip + purl, trial: false, playable: true, level: fileMeta.level || info.filename || '', quality: fileMeta.label || info.filename || '', filename: info.filename || '', requestedQuality };
  }
  const restriction = classifyQQPlaybackRestriction(info, { hasSession: !!(uin && musicKey), hasPlaybackKey: !!(uin && playbackKey) });
  return { provider: 'qq', url: '', playable: false, error: 'QQ_URL_UNAVAILABLE', loggedIn: !!(uin && musicKey), playbackKeyReady: !!(uin && playbackKey), restriction, reason: restriction.category, message: restriction.message, qqCode: info && (info.result || info.code || info.errtype), rawMessage: info && (info.msg || info.tips || info.errmsg || ''), tried: fileCandidates.map(item => item.label + ' · ' + item.filename), requestedQuality };
}

// --- Artist detail ---
async function handleQQArtistDetail(mid, limit) {
  const singerMid = String(mid || '').trim();
  const num = Math.max(10, Math.min(80, parseInt(limit || '36', 10) || 36));
  if (!singerMid) return { provider: 'qq', error: 'MISSING_SINGER_MID', artist: null, songs: [] };
  const json = await qqMusicRequest({
    comm: { ct: 24, cv: 0 },
    singer: { module: 'music.web_singer_info_svr', method: 'get_singer_detail_info', param: { sort: 5, singermid: singerMid, sin: 0, num } },
  }, { cookie: true });
  const block = json && json.singer;
  if (!block || Number(block.code || 0) !== 0) return { provider: 'qq', error: block && (block.message || block.msg || block.code) || 'QQ_ARTIST_DETAIL_FAILED', artist: null, songs: [] };
  const data = block.data || {};
  const singerInfo = data.singer_info || data.singerInfo || {};
  const rawSongs = Array.isArray(data.songlist) ? data.songlist : [];
  const songs = rawSongs.map(raw => mapQQTrack(raw && (raw.track_info || raw.songInfo || raw.songinfo || raw.song) || raw, {})).filter(s => s && s.name && (s.mid || s.id));
  const matchedSongArtist = songs[0] && (songs[0].artists || []).find(a => a && a.mid === singerMid);
  const artistMid = singerInfo.mid || singerMid;
  const artistName = singerInfo.name || singerInfo.title || (matchedSongArtist && matchedSongArtist.name) || '';
  const totalSong = Number(data.total_song || data.song_count || 0) || songs.length;
  return { provider: 'qq', artist: { provider: 'qq', id: singerInfo.id || '', mid: artistMid, name: artistName, avatar: singerInfo.pic || singerInfo.avatar || qqSingerAvatar(artistMid, 300), fans: Number(singerInfo.fans || 0) || 0, musicSize: totalSong, albumSize: Number(data.total_album || 0) || 0, mvSize: Number(data.total_mv || 0) || 0 }, total: totalSong, songs };
}

// --- Comments ---
function mapQQComment(raw) {
  raw = raw || {};
  const user = raw.user || raw.uin || {};
  const nickname = raw.nick || raw.nickname || raw.encrypt_uin || user.nick || user.nickname || user.name || 'QQ 音乐用户';
  const avatar = raw.avatarurl || raw.avatar || user.avatarurl || user.avatar || '';
  const timeRaw = Number(raw.time || raw.commenttime || raw.createTime || 0) || 0;
  return { id: raw.commentid || raw.commentId || raw.id || '', content: raw.rootcommentcontent || raw.content || raw.comment || '', likedCount: Number(raw.praisenum || raw.praise_num || raw.likedCount || 0) || 0, time: timeRaw && timeRaw < 10000000000 ? timeRaw * 1000 : timeRaw, user: { id: raw.encrypt_uin || raw.uin || user.uin || '', nickname, avatar } };
}

async function handleQQSongComments(id, mid, limit, offset) {
  let topid = String(id || '').replace(/\D/g, '');
  if (!topid && mid) { try { const detail = await qqSongDetail(mid, { mid }); topid = String((detail && (detail.qqId || detail.id)) || '').replace(/\D/g, ''); } catch (e) {} }
  if (!topid) return { provider: 'qq', error: 'Missing QQ song id', comments: [] };
  const page = Math.max(0, Math.floor((offset || 0) / Math.max(1, limit || 20)));
  const uin = qqCookieUin() || '0';
  const body = await qqGetJSON('https://c.y.qq.com/base/fcgi-bin/fcg_global_comment_h5.fcg', {
    g_tk: '5381', loginUin: uin, hostUin: '0', format: 'json', inCharset: 'utf8', outCharset: 'utf-8',
    notice: '0', platform: 'yqq.json', needNewCode: '0', cid: '205360772', reqtype: '2', biztype: '1',
    topid, cmd: '8', needmusiccrit: '0', pagenum: String(page), pagesize: String(limit || 20),
  }, { headers: { Referer: 'https://y.qq.com/n/ryqq/songDetail/' + encodeURIComponent(mid || topid) } });
  const hotList = body && body.hot_comment && body.hot_comment.commentlist;
  const normalList = body && body.comment && body.comment.commentlist;
  const raw = (offset === 0 && Array.isArray(hotList) && hotList.length) ? hotList : (normalList || []);
  const comments = (raw || []).map(mapQQComment).filter(c => c.content);
  const total = Number(body && body.comment && (body.comment.commenttotal || body.comment.comment_total)) || comments.length;
  return { provider: 'qq', id: topid, total, comments, hot: !!(offset === 0 && Array.isArray(hotList) && hotList.length) };
}

// --- Lyrics ---
function decodeHtmlEntities(text) {
  return String(text || '').replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16))).replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10))).replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ');
}

function decodeQQLyricText(text) {
  let raw = decodeHtmlEntities(String(text || '').trim());
  if (!raw) return '';
  const compact = raw.replace(/\s+/g, '');
  const looksBase64 = compact.length >= 8 && compact.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(compact);
  if (looksBase64 && !/^\s*\[/.test(raw)) {
    try { const decoded = Buffer.from(compact, 'base64').toString('utf8').replace(/^﻿/, ''); if (decoded && (decoded.includes('[') || /[一-龥]/.test(decoded))) raw = decoded; } catch (e) {}
  }
  return decodeHtmlEntities(raw).replace(/\r\n/g, '\n').trim();
}

function normalizeQQSongId(id) { const n = String(id || '').replace(/\D/g, ''); return n ? Number(n) : 0; }

async function handleQQLyric(mid, id) {
  const songMID = String(mid || '').trim();
  const songID = normalizeQQSongId(id);
  if (!songMID && !songID) return { provider: 'qq', error: 'Missing QQ song mid or id', lyric: '' };
  let lyricText = '', transText = '', qrcText = '', romaText = '', source = 'qq-musicu';
  try {
    const param = {}; if (songMID) param.songMID = songMID; if (songID) param.songID = songID;
    const json = await qqMusicRequest({ comm: { ct: 24, cv: 0 }, lyric: { module: 'music.musichallSong.PlayLyricInfo', method: 'GetPlayLyricInfo', param } }, { cookie: true });
    const data = json && json.lyric && json.lyric.data;
    lyricText = decodeQQLyricText(data && data.lyric); transText = decodeQQLyricText(data && data.trans);
    qrcText = decodeQQLyricText(data && data.qrc); romaText = decodeQQLyricText(data && data.roma);
  } catch (e) {}
  if (!lyricText && songMID) {
    try {
      const body = await qqGetJSON('https://c.y.qq.com/lyric/fcgi-bin/fcg_query_lyric_new.fcg', {
        songmid: songMID, songtype: '0', format: 'json', nobase64: '1', g_tk: '5381',
        loginUin: qqCookieUin() || '0', hostUin: '0', inCharset: 'utf8', outCharset: 'utf-8',
        notice: '0', platform: 'yqq.json', needNewCode: '0',
      }, { headers: { Referer: 'https://y.qq.com/portal/player.html' } });
      lyricText = decodeQQLyricText(body && body.lyric);
      transText = decodeQQLyricText(body && (body.trans || body.tlyric)) || transText;
      source = 'qq-legacy';
    } catch (e) {}
  }
  return { provider: 'qq', id: songID || '', mid: songMID, lyric: lyricText, tlyric: transText, yrc: '', qrc: qrcText, roma: romaText, source: lyricText ? source : 'qq-empty' };
}

module.exports = {
  getQQCookie, setQQCookie,
  getQQLoginInfo, handleQQSearch, handleQQSongUrl, handleQQLyric,
  handleQQUserPlaylists, handleQQPlaylistTracks, handleQQArtistDetail, handleQQSongComments,
  qqCookieUin, qqCookieMusicKey,
};
