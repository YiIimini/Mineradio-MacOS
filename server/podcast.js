// Mineradio Podcast mapping and collection module
let _userCookie = '';
let _dj_sublist, _user_audio, _dj_paygift, _sati_resource_sub_list, _record_recent_voice;
let _mapArtists;

function setup(opts) {
  _dj_sublist = opts.dj_sublist || _dj_sublist;
  _user_audio = opts.user_audio || _user_audio;
  _dj_paygift = opts.dj_paygift || _dj_paygift;
  _sati_resource_sub_list = opts.sati_resource_sub_list || _sati_resource_sub_list;
  _record_recent_voice = opts.record_recent_voice || _record_recent_voice;
  _mapArtists = opts.mapArtists || _mapArtists;
}
function setCookie(c) { _userCookie = c; }

function mapPodcastRadio(r) {
  r = r || {};
  const dj = r.dj || r.djSimple || r.djUser || r.creator || {};
  const id = r.id || r.rid || r.radioId;
  return { id, rid: id, name: r.name || r.radioName || '', cover: r.picUrl || r.picURL || r.coverUrl || r.coverImgUrl || r.avatarUrl || '', desc: r.desc || r.description || r.rcmdText || '', djName: dj.nickname || r.djName || r.nickname || '', category: r.category || r.categoryName || '', programCount: r.programCount || r.programNum || r.programCnt || 0, subCount: r.subCount || r.subedCount || r.subscriberCount || 0 };
}

function mapPodcastProgram(p, fallbackRadio) {
  p = p || {};
  const mainSong = p.mainSong || p.song || p.mainTrack || {};
  const radio = p.radio || fallbackRadio || {};
  const mappedRadio = mapPodcastRadio(radio);
  const artists = _mapArtists ? _mapArtists(mainSong.ar || mainSong.artists || []) : [];
  const album = mainSong.al || mainSong.album || {};
  const dj = p.dj || radio.dj || {};
  const playableId = mainSong.id || p.mainSongId || p.songId;
  return { type: 'podcast', source: 'podcast', id: playableId, programId: p.id || p.programId, radioId: mappedRadio.id, name: p.name || mainSong.name || '', artist: mappedRadio.name || dj.nickname || artists.map(a => a.name).join(' / ') || mappedRadio.djName || '', artists, artistId: artists[0] && artists[0].id, album: mappedRadio.name || album.name || 'Podcast', cover: p.coverUrl || p.cover || p.blurCoverUrl || mappedRadio.cover || album.picUrl || '', duration: p.duration || mainSong.dt || mainSong.duration || 0, fee: mainSong.fee, djName: mappedRadio.djName || dj.nickname || '', radioName: mappedRadio.name || '', desc: p.description || p.desc || '', createTime: p.createTime || 0, serialNum: p.serialNum || p.serial || 0 };
}

function firstArrayFrom(obj, keys) {
  obj = obj || {};
  for (const key of keys) { const value = obj[key]; if (Array.isArray(value)) return value; if (value && Array.isArray(value.list)) return value.list; if (value && Array.isArray(value.data)) return value.data; if (value && Array.isArray(value.resources)) return value.resources; }
  return [];
}

function mapPodcastVoice(v) {
  v = v || {};
  const raw = v.resource || v.voice || v.data || v.program || v;
  const mainSong = raw.mainSong || raw.song || raw.track || {};
  const radio = raw.radio || raw.djRadio || raw.voiceList || raw.podcast || {};
  const playableId = raw.trackId || raw.songId || raw.mainSongId || mainSong.id || raw.id;
  return { type: 'podcast', source: 'podcast', sourceType: 'podcast-voice', id: playableId, programId: raw.programId || raw.voiceId || raw.id, radioId: radio.id || radio.radioId || radio.voiceListId || raw.radioId || raw.voiceListId, name: raw.name || raw.songName || raw.title || mainSong.name || '', artist: (radio.name || radio.radioName || radio.voiceListName || raw.podcastName || raw.djName || 'Voice'), album: radio.name || radio.radioName || raw.podcastName || 'Podcast', cover: raw.coverUrl || raw.cover || raw.picUrl || raw.coverImgUrl || radio.picUrl || radio.coverUrl || '', duration: raw.duration || raw.durationMs || mainSong.dt || mainSong.duration || 0, djName: raw.djName || (radio.dj && radio.dj.nickname) || '', radioName: radio.name || radio.radioName || raw.podcastName || '', desc: raw.desc || raw.description || '' };
}

function mapPodcastCollectionRadio(r, key) {
  const radio = mapPodcastRadio(r);
  return { ...radio, type: 'podcast-radio', sourceType: 'podcast-radio', collectionKey: key || '', radioId: radio.id, name: radio.name, artist: radio.djName || radio.category || 'Podcast', album: radio.category || 'Podcast' };
}

function podcastCollectionMeta(key, items) {
  const meta = { collect: { key: 'collect', title: '收藏播客', sub: '你收藏的播客', itemType: 'radio' }, created: { key: 'created', title: '创建播客', sub: '你创建的播客', itemType: 'radio' }, liked: { key: 'liked', title: '喜欢的声音', sub: '收藏或最近喜欢的声音', itemType: 'voice' } }[key] || { key, title: key, sub: '', itemType: 'radio' };
  const first = (items || [])[0] || {};
  return { ...meta, count: (items || []).length, cover: first.cover || first.picUrl || first.coverUrl || '' };
}

async function fetchMyPodcastItems(key, info, limit, offset) {
  limit = Math.max(8, Math.min(60, Number(limit) || 30));
  offset = Math.max(0, Number(offset) || 0);
  if (key === 'collect') {
    const r = await _dj_sublist({ limit, offset, cookie: _userCookie, timestamp: Date.now() });
    const raw = firstArrayFrom(r.body, ['djRadios', 'djradios', 'radios', 'data']);
    return { itemType: 'radio', items: raw.map(x => mapPodcastCollectionRadio(x, key)).filter(x => x.id) };
  }
  if (key === 'created') {
    const r = await _user_audio({ uid: info.userId, cookie: _userCookie, timestamp: Date.now() });
    const raw = firstArrayFrom(r.body, ['data', 'djRadios', 'djradios', 'radios']);
    return { itemType: 'radio', items: raw.map(x => mapPodcastCollectionRadio(x, key)).filter(x => x.id) };
  }
  if (key === 'paid') {
    const r = await _dj_paygift({ limit, offset, cookie: _userCookie, timestamp: Date.now() });
    const raw = firstArrayFrom(r.body, ['data', 'djRadios', 'djradios', 'radios']);
    return { itemType: 'radio', items: raw.map(x => mapPodcastCollectionRadio(x, key)).filter(x => x.id) };
  }
  if (key === 'liked') {
    let raw = [];
    try { const sati = await _sati_resource_sub_list({ cookie: _userCookie, timestamp: Date.now() }); raw = firstArrayFrom(sati.body, ['data', 'resources', 'list']); } catch (e) {}
    if (!raw.length) { try { const recent = await _record_recent_voice({ limit, cookie: _userCookie, timestamp: Date.now() }); raw = firstArrayFrom(recent.body, ['data', 'list', 'resources']); } catch (e) {} }
    return { itemType: 'voice', items: raw.map(mapPodcastVoice).filter(x => x.id && x.name) };
  }
  return { itemType: 'radio', items: [] };
}

module.exports = { setup, setCookie, mapPodcastRadio, mapPodcastProgram, mapPodcastVoice, mapPodcastCollectionRadio, podcastCollectionMeta, fetchMyPodcastItems, firstArrayFrom };
