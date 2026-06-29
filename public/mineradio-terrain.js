// ============================================================
//  Mineradio Terrain Preset — sonic-topography v3
//  Dual-mode: InstancedMesh pillars (柱形/不规则) + plane foam (泡沫)
//  THREE.js r128 compatible
// ============================================================
(function(){
  if (typeof THREE === 'undefined') {
    console.warn('Terrain: THREE not loaded');
    window.initTerrain = function(){ return false; };
    window.clearTerrainPresetResidue = function(){};
    window.tickTerrain = function(){};
    window.renderTerrain = function(){ return false; };
    window.switchTerrainTheme = function(){};
    return;
  }

  window.TERRAIN_PRESET_INDEX = 7;
  window.TERRAIN_FOAM_PRESET_INDEX = 8;
  window.TERRAIN_IRREGULAR_PRESET_INDEX = 9;

  var terrainScene = null;
  var terrainCamera = null;
  var terrainInitialized = false;
  var terrainTime = 0;
  var currentThemeName = 'nocturnal';

  // ─── Theme system ───
  var terrainTheme = {
    uBaseColor1: new THREE.Color('#03050a'),
    uBaseColor2: new THREE.Color('#080d17'),
    uCoolCore: new THREE.Color('#004dff'),
    uWarmCore: new THREE.Color('#ff331a'),
    uGlowIntensity: 1.0
  };
  var terrainThemes = {
    nocturnal:   { base1:'#03050a', base2:'#080d17', cool:'#004dff', warm:'#ff331a', accent:'#33e6ff', glow:1.0 },
    neon_tokyo:  { base1:'#060618', base2:'#100830', cool:'#ff33aa', warm:'#33ffcc', accent:'#ffffff', glow:2.5 },
    cyber_forest:{ base1:'#040c08', base2:'#0a180a', cool:'#33ffaa', warm:'#ccff33', accent:'#99ff66', glow:2.3 },
    minimal_mono:{ base1:'#0a0a0a', base2:'#1a1a1a', cool:'#eeeeee', warm:'#ffffff', accent:'#ffffff', glow:1.5 },
    foam_bubble:{ base1:'#080e28', base2:'#0c1a40', cool:'#3377ff', warm:'#ee5533', accent:'#44ddff', glow:1.8 }
  };

  function applyTerrainTheme(name) {
    var t = terrainThemes[name] || terrainThemes.nocturnal;
    terrainTheme.uBaseColor1.set(t.base1);
    terrainTheme.uBaseColor2.set(t.base2);
    terrainTheme.uCoolCore.set(t.cool);
    terrainTheme.uWarmCore.set(t.warm);
    terrainTheme.uGlowIntensity = t.glow;
    currentThemeName = name;
  }
  window.switchTerrainTheme = applyTerrainTheme;

  // ─── Grid config ───
  var GRID = 112;
  var SPACING = 1.05;
  var SIZE = GRID * SPACING;
  var HALF = SIZE / 2;
  function sprintf(fmt) {
    var args = Array.prototype.slice.call(arguments, 1);
    return fmt.replace(/%\.\d+f/g, function(m) {
      var v = args.shift();
      var decimals = parseInt(m.match(/\.(\d+)/)[1]);
      return v.toFixed(decimals);
    });
  }

  var PILLAR_COUNT = GRID * GRID;

  // ─── Audio analysis ───
  var terrainFreqData = new Uint8Array(1024);
  var terrainAudio = { subBass:0, bass:0, lowMid:0, mid:0, highMid:0, presence:0, brilliance:0, air:0, energy:0 };

  function bandRms(data, len, sampleRate, hz0, hz1) {
    var binHz = sampleRate / (len * 2);
    var a = Math.max(0, Math.floor(hz0 / binHz));
    var b = Math.min(len - 1, Math.ceil(hz1 / binHz));
    var sum = 0, count = 0;
    for (var i = a; i <= b; i++) { var v = data[i]/255; sum += v*v; count++; }
    return count ? Math.sqrt(sum/count) : 0;
  }

  function updateTerrainAudio() {
    if (typeof analyser === 'undefined') return;
    var rate = (typeof audioCtx !== 'undefined' && audioCtx && audioCtx.sampleRate) || 44100;
    var target = {subBass:0,bass:0,lowMid:0,mid:0,highMid:0,presence:0,brilliance:0,air:0,energy:0};
    if (analyser && typeof playing !== 'undefined' && playing && typeof audio !== 'undefined' && audio && !audio.paused) {
      try { analyser.getByteFrequencyData(terrainFreqData); } catch(e) { return; }
      var len = terrainFreqData.length;
      target.subBass = bandRms(terrainFreqData, len, rate, 20, 60);
      target.bass = bandRms(terrainFreqData, len, rate, 60, 150);
      target.lowMid = bandRms(terrainFreqData, len, rate, 150, 300);
      target.mid = bandRms(terrainFreqData, len, rate, 300, 1200);
      target.highMid = bandRms(terrainFreqData, len, rate, 1200, 3000);
      target.presence = bandRms(terrainFreqData, len, rate, 3000, 6000);
      target.brilliance = bandRms(terrainFreqData, len, rate, 6000, 12000);
      target.air = bandRms(terrainFreqData, len, rate, 12000, 20000);
      var energySum = 0;
      for (var i = 0; i < len; i++) energySum += terrainFreqData[i]/255;
      target.energy = energySum / len;
    }
    var smooth = target.energy > 0.001 ? 0.12 : 0.06;
    for (var k in target) {
      if (target.hasOwnProperty(k)) terrainAudio[k] += (target[k] - terrainAudio[k]) * smooth;
    }
  }

  // ─── Deterministic hash for pillar variation ───
  function phash(ix, iy, seed) {
    var h = ix * 374761393 + iy * 668265263 + seed * 1274126177;
    h = (h ^ (h >> 13)) * 1274126177;
    h = h ^ (h >> 16);
    return (h & 0x7fffffff) / 0x7fffffff;
  }

  // ─── Pillar data ───
  var pillarData = null;
  function buildPillarData() {
    pillarData = new Array(PILLAR_COUNT);
    for (var iy = 0; iy < GRID; iy++) {
      for (var ix = 0; ix < GRID; ix++) {
        var idx = iy * GRID + ix;
        var cx = (ix - GRID/2 + 0.5) * SPACING;
        var cz = (iy - GRID/2 + 0.5) * SPACING;
        var dist = Math.sqrt(cx*cx + cz*cz);
        var falloff = Math.max(0.12, 1 - dist / (HALF * 1.08));
        var r1 = phash(ix, iy, 1);
        var r2 = phash(ix, iy, 2);
        var r3 = phash(ix, iy, 3);
        var MAX_R = HALF * 1.02;
        var inCircle = dist <= MAX_R;
        var fadeDist = Math.max(0, (MAX_R - dist) / (MAX_R * 0.3));
        var circleFade = Math.min(1, fadeDist);
        pillarData[idx] = {
          cx: cx, cz: cz, dist: dist, falloff: falloff,
          r1: r1, r2: r2, r3: r3,
          inCircle: inCircle, circleFade: circleFade,
          baseNoise: (Math.sin(cx*0.22+cz*0.17)*0.5+0.5) * (Math.sin(cx*0.13-cz*0.19)*0.5+0.5)
        };
      }
    }
  }

  // ─── Pillar InstancedMesh ───
  var pillarInstanced = null;

  // ─── Raindrop ripple system ───
  var rainDrops = [];
  var MAX_DROPS = 4;
  var DROP_LIFETIME = 3.5;
  var dropSpawnTimer = 0;

  function spawnRaindrop() {
    var angle = Math.random() * Math.PI * 2;
    var dist = Math.random() * HALF * 0.85;
    rainDrops.push({
      x: Math.cos(angle) * dist,
      z: Math.sin(angle) * dist,
      birth: terrainTime
    });
    if (rainDrops.length > MAX_DROPS) rainDrops.shift();
  }

  function updateRaindrops(dt) {
    dropSpawnTimer += dt;
    if (dropSpawnTimer > 1.2 + Math.random() * 1.5 && rainDrops.length < MAX_DROPS) {
      dropSpawnTimer = 0;
      spawnRaindrop();
    }
    rainDrops = rainDrops.filter(function(d) { return terrainTime - d.birth < DROP_LIFETIME; });
  }

  function getRippleSum(cx, cz) {
    var sum = 0;
    for (var r = 0; r < rainDrops.length; r++) {
      var drop = rainDrops[r];
      var age = terrainTime - drop.birth;
      if (age > DROP_LIFETIME) continue;
      var dx = cx - drop.x, dz = cz - drop.z;
      var distTo = Math.sqrt(dx*dx + dz*dz);
      var life = Math.max(0, 1 - age/DROP_LIFETIME);
      var ripple = Math.sin(distTo * 0.7 - age * 2.5) * Math.exp(-distTo * 0.25) * life * life;
      sum += ripple;
    }
    return sum;
  }

  function updatePillarInstances() {
    if (!pillarInstanced) return;
    var a = terrainAudio;
    var activity = (a.energy > 0.005) ? 1.0 : 0.0;
    if (!pillarInstanced._activity) pillarInstanced._activity = 0;
    pillarInstanced._activity += (activity - pillarInstanced._activity) * 0.04;
    if (pillarInstanced.material) pillarInstanced.material.opacity = pillarInstanced._activity;

    var t = terrainTheme;
    var coolColor = new THREE.Color();
    var warmColor = new THREE.Color();
    var color = new THREE.Color();
    var matrix = new THREE.Matrix4();
    var pos = new THREE.Vector3();
    var quat = new THREE.Quaternion();
    var scale = new THREE.Vector3();

    for (var i = 0; i < PILLAR_COUNT; i++) {
      var d = pillarData[i];
      var dist = d.dist;
      var falloff = d.falloff;

      var subW = Math.max(0, 1 - dist / (HALF * 0.5)) * falloff;
      var bassW = Math.max(0, 1 - Math.abs(dist - HALF*0.5) / (HALF*0.5)) * falloff;
      var lowMidW = (d.r1 * 0.7 + 0.3) * falloff;
      var midW = (Math.sin(d.cx*0.25+d.cz*0.2)*0.5+0.5) * falloff;
      var highMidW = (d.r2 > 0.72 ? 1 : 0) * Math.max(0, (dist/HALF - 0.08)) * falloff;
      var energyW = (d.r3 > 0.95 ? 1 : 0) * falloff * 0.5;

      var elevation = 0;
      elevation += a.subBass * subW * 5.0;
      elevation += a.bass * bassW * 4.0;
      elevation += a.lowMid * lowMidW * 3.0;
      elevation += a.mid * Math.abs(midW) * 3.5;
      elevation += a.highMid * highMidW * 3.0;
      elevation += a.energy * energyW * 6.0;

      elevation += getRippleSum(d.cx, d.cz) * 3.5;

      var rippleWave = Math.sin(dist * 0.12 - terrainTime * 0.6) * 0.5 + 0.5;
      var rippleBoost = rippleWave * falloff * 2.0;
      elevation += a.energy * rippleBoost;

      var idleH = d.baseNoise * 0.6 * falloff;
      elevation += idleH;

      var act = pillarInstanced._activity;
      elevation = idleH + (elevation - idleH) * act;

      var height = Math.max(0.02, elevation + 0.05);
      if (!d.inCircle) height = 0.0;
      height *= d.circleFade;

      var hNorm = Math.min(1, height / 5.0);
      var brightCool = new THREE.Color().copy(t.uCoolCore).multiplyScalar(1.4);
      var brightWarm = new THREE.Color().copy(t.uWarmCore).multiplyScalar(1.3);
      var perVar = (d.r1 - 0.5) * 0.35;
      var hAngle = d.r2 * 0.25 - 0.12;
      brightCool.r = Math.min(1, brightCool.r + perVar * 0.4);
      brightCool.g = Math.min(1, brightCool.g + perVar * 0.2);
      brightCool.b = Math.max(0, brightCool.b - Math.abs(perVar) * 0.3);
      brightWarm.r = Math.min(1, brightWarm.r + perVar * 0.3 + hAngle);
      brightWarm.g = Math.min(1, brightWarm.g + perVar * 0.25);
      brightWarm.b = Math.max(0, brightWarm.b - Math.abs(perVar) * 0.2);
      var edgeBlend = Math.max(0.15, 1 - dist / (HALF * 1.1));
      var fadeAlpha = d.circleFade;
      var mixT = hNorm * edgeBlend;
      color.copy(brightCool).lerp(brightWarm, mixT);
      if (d.r3 > 0.92) {
        var accent = new THREE.Color();
        if (d.r3 > 0.97) accent.setHSL(0.08 + d.r1 * 0.1, 0.9, 0.5 + hNorm * 0.3);
        else if (d.r3 > 0.95) accent.setHSL(0.55 + d.r1 * 0.1, 0.8, 0.45 + hNorm * 0.3);
        else accent.setHSL(0.75 + d.r1 * 0.1, 0.7, 0.4 + hNorm * 0.3);
        color.lerp(accent, 0.5);
      }
      color.multiplyScalar(0.5 + fadeAlpha * 0.5);

      pos.set(d.cx, height * 0.5, d.cz);
      quat.identity();
      scale.set(0.88, height, 0.88);
      matrix.compose(pos, quat, scale);
      pillarInstanced.setMatrixAt(i, matrix);

      if (pillarInstanced.instanceColor) {
        pillarInstanced.setColorAt(i, color);
      }
    }
    pillarInstanced.instanceMatrix.needsUpdate = true;
    if (pillarInstanced.instanceColor) { pillarInstanced.instanceColor.needsUpdate = true; }
  }

  // ─── Foam rendering (plane + ShaderMaterial) ───
  var foamMaterial = null;
  var foamMesh = null;
  var foamAudioActivity = 0;

  var foamVertShader = [
    'uniform float uTime, uSubBass, uBass, uLowMid, uMid, uHighMid;',
    'uniform vec3 uDrops[6];',
    'uniform float uPresence, uBrilliance, uAir, uEnergy;',
    'varying float vHeight; varying vec2 vWorldXZ;',
    'float random(vec2 st){return fract(sin(dot(st,vec2(12.9898,78.233)))*43758.5453);}',
    'vec3 mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec2 mod289(vec2 x){return x-floor(x*(1.0/289.0))*289.0;}',
    'vec3 permute(vec3 x){return mod289(((x*34.0)+1.0)*x);}',
    'float snoise(vec2 v){const vec4 C=vec4(0.211324865405187,0.366025403784439,-0.577350269189626,0.024390243902439);vec2 i=floor(v+dot(v,C.yy));vec2 x0=v-i+dot(i,C.xx);vec2 i1=(x0.x>x0.y)?vec2(1.0,0.0):vec2(0.0,1.0);vec4 x12=x0.xyxy+C.xxzz;x12.xy-=i1;i=mod289(i);vec3 p=permute(permute(i.y+vec3(0.0,i1.y,1.0))+i.x+vec3(0.0,i1.x,1.0));vec3 m=max(0.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.0);m=m*m;m=m*m;vec3 x=2.0*fract(p*C.www)-1.0;vec3 h=abs(x)-0.5;vec3 ox=floor(x+0.5);vec3 a0=x-ox;m*=1.79284291400159-0.85373472095314*(a0*a0+h*h);vec3 g;g.x=a0.x*x0.x+h.x*x0.y;g.yz=a0.yz*x12.xz+h.yz*x12.yw;return 130.0*dot(m,g);}',
    'void main(){',
    'vec2 pos2D=position.xz; vWorldXZ=pos2D;',
    'float centerDist=length(pos2D);',
    'float wave=sin(pos2D.x*0.15+pos2D.y*0.1-uTime*0.6)*0.7+0.5;',
    'float globalFalloff=smoothstep(' + (HALF*0.8).toFixed(1) + ', ' + (HALF*0.33).toFixed(1) + ', centerDist);',
    'float idleElevation=wave*1.5*globalFalloff;',
    'float subLift=uSubBass*smoothstep(' + (HALF*0.55).toFixed(1) + ',0.0,centerDist)*3.5;',
    'float bassLift=uBass*smoothstep(' + (HALF*0.75).toFixed(1) + ',4.0,centerDist+sin(pos2D.x*0.1-pos2D.y*0.12)*6.0)*(snoise(pos2D*0.08)*0.3+0.7)*3.5;',
    'float lowMidLift=uLowMid*0.5+uLowMid*snoise(pos2D*0.1)*0.75;',
    'float midLift=uMid*max(0.0,sin(pos2D.x*0.2+pos2D.y*0.2-uTime*2.0))*2.5;',
    'float highMidLift=uHighMid*smoothstep(8.0,' + (HALF*1.05).toFixed(1) + ',centerDist)*1.8;',
    'float audioElevation=(subLift+bassLift+lowMidLift+midLift+highMidLift)*globalFalloff;',
    'float elevation=idleElevation+audioElevation;',
    sprintf("float rippleR=sin(centerDist*0.12-uTime*0.6)*0.5+0.5;"),
    sprintf("elevation+=rippleR*(1.0-centerDist/%.1f)*uEnergy*2.0;",HALF*1.2),
    'for(int i=0;i<6;i++){float dx=pos2D.x-uDrops[i].x;float dz=pos2D.y-uDrops[i].y;float dt2=sqrt(dx*dx+dz*dz);float ra=uDrops[i].z;float rl=max(0.0,1.0-ra/3.5);elevation+=sin(dt2*0.4-ra*2.0)*exp(-dt2*0.22)*rl*rl*2.5;}',
    'vHeight=elevation/6.25;',
    'vec3 newPosition=position; newPosition.y=elevation;',
    'gl_Position=projectionMatrix*modelViewMatrix*vec4(newPosition,1.0);',
    '}'
  ].join('\n');

  var foamFragShader = [
    'uniform float uTime,uAudioActivity;',
    'uniform vec3 uBaseColor1,uBaseColor2,uCoolCore,uWarmCore;',
    'uniform float uGlowIntensity;',
    'varying float vHeight; varying vec2 vWorldXZ;',
    'float random(vec2 st){return fract(sin(dot(st,vec2(12.9898,78.233)))*43758.5453);}',
    'void main(){',
    'float centerDist=length(vWorldXZ);',
    'float normHeight=clamp(vHeight,0.0,1.0);',
    'float warmBlend=smoothstep(0.0,1.0,0.5-centerDist/' + (HALF*2).toFixed(1) + '+sin(uTime*0.25)*0.15);',
    'vec3 zoneColor=mix(uCoolCore,uWarmCore,warmBlend);',
    'float rnd=random(vWorldXZ*3.7);',
    'float MAX_R=' + (HALF*1.02).toFixed(1) + ';',
    'vec3 glow=mix(uBaseColor2,zoneColor,normHeight*0.85)*uGlowIntensity*(1.0-smoothstep(' + (HALF*0.65).toFixed(1) + ',MAX_R,centerDist));',
    'vec3 body=mix(uBaseColor1,uBaseColor2,normHeight*(1.0-smoothstep(' + (HALF*0.6).toFixed(1) + ',MAX_R,centerDist)));',
    'float topInt=clamp(smoothstep(0.0,0.3,normHeight)+0.15,0.0,1.0);',
    'vec3 finalColor=mix(body,glow,topInt);',
    'float dither=(rnd-0.5)*0.06;',
    sprintf("float circleAlpha=1.0-smoothstep(MAX_R*0.65,MAX_R,centerDist);"),
    'float alphaFade=circleAlpha;',
    'float bgAlpha=mix(0.0,alphaFade+dither,uAudioActivity);',
    'gl_FragColor=vec4(finalColor,bgAlpha);',
    '}'
  ].join('\n');

  function createFoamPlane() {
    var FOAM_GRID = 224;
    foamMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime:{value:0}, uSubBass:{value:0}, uBass:{value:0},
        uLowMid:{value:0}, uMid:{value:0}, uHighMid:{value:0},
        uPresence:{value:0}, uBrilliance:{value:0}, uAir:{value:0}, uEnergy:{value:0},
        uAudioActivity:{value:0},
        uBaseColor1:{value:new THREE.Color('#080e28')}, uBaseColor2:{value:new THREE.Color('#0c1a40')},
        uCoolCore:{value:new THREE.Color('#3377ff')}, uWarmCore:{value:new THREE.Color('#ee5533')},
        uGlowIntensity:{value:1.8},
        uDrops:{value:[new THREE.Vector3(180,180,100),new THREE.Vector3(180,180,100),new THREE.Vector3(180,180,100),new THREE.Vector3(180,180,100),new THREE.Vector3(180,180,100),new THREE.Vector3(180,180,100)]}
      },
      vertexShader: foamVertShader,
      fragmentShader: foamFragShader,
      transparent: true
    });
    var geo = new THREE.PlaneGeometry(SIZE, SIZE, FOAM_GRID, FOAM_GRID);
    geo.rotateX(-Math.PI/2);
    var mesh = new THREE.Mesh(geo, foamMaterial);
    mesh.visible = false;
    return mesh;
  }

  function updateFoamUniforms() {
    if (!foamMaterial) return;
    var u = foamMaterial.uniforms;
    var a = terrainAudio;
    u.uTime.value = terrainTime;
    u.uSubBass.value = a.subBass; u.uBass.value = a.bass; u.uLowMid.value = a.lowMid;
    u.uMid.value = a.mid; u.uHighMid.value = a.highMid;
    u.uPresence.value = a.presence; u.uBrilliance.value = a.brilliance; u.uAir.value = a.air;
    u.uEnergy.value = a.energy;
    foamAudioActivity += ((a.energy>0.005?1:0) - foamAudioActivity) * 0.04;
    u.uAudioActivity.value = foamAudioActivity;
    var t = terrainTheme;
    u.uBaseColor1.value.copy(t.uBaseColor1);
    u.uBaseColor2.value.copy(t.uBaseColor2);
    u.uCoolCore.value.copy(t.uCoolCore);
    u.uWarmCore.value.copy(t.uWarmCore);
    u.uGlowIntensity.value = t.uGlowIntensity;
    var drops = u.uDrops.value;
    for (var i = 0; i < 6; i++) {
      if (i < rainDrops.length) {
        drops[i].set(rainDrops[i].x, rainDrops[i].z, terrainTime - rainDrops[i].birth);
      } else {
        drops[i].set(180, 180, 100);
      }
    }
  }

  // ─── Irregular rendering (plane + ShaderMaterial, v2-style gaps) ───
  var irregularMaterial = null;
  var irregularMesh = null;
  var irregularAudioActivity = 0;

  var irregularVertShader = [
    'uniform float uTime, uSubBass, uBass, uLowMid, uMid, uHighMid;',
    'uniform vec3 uDrops[6];',
    'uniform float uPresence, uBrilliance, uAir, uEnergy;',
    'varying float vHeight; varying vec2 vWorldXZ;',
    'float random(vec2 st){return fract(sin(dot(st,vec2(12.9898,78.233)))*43758.5453);}',
    'void main(){',
    'vec2 pos2D=position.xz; vWorldXZ=pos2D;',
    'float centerDist=length(pos2D);',
    'float wave=sin(pos2D.x*0.15+pos2D.y*0.1-uTime*0.6)*0.7+0.5;',
    sprintf("float globalFalloff=smoothstep(%.1f,%.1f,centerDist);",HALF*1.15,HALF*0.45),
    'float idleElevation=wave*1.5*globalFalloff;',
    sprintf("float subLift=uSubBass*smoothstep(%.1f,0.0,centerDist)*3.5;",HALF*0.55),
    'float bassNoiseVal=sin(pos2D.x*0.1-pos2D.y*0.12)*6.0;',
    sprintf("float bassLift=uBass*smoothstep(%.1f,4.0,centerDist+bassNoiseVal)*(random(pos2D)*0.6+0.4)*3.0;",HALF*0.75),
    'float lowMidLift=uLowMid*0.5+uLowMid*random(pos2D)*0.75;',
    'float midLift=uMid*max(0.0,sin(pos2D.x*0.2+pos2D.y*0.2-uTime*2.0))*2.5;',
    sprintf("float highMidLift=uHighMid*smoothstep(8.0,%.1f,centerDist)*1.8;",HALF*1.05),
    'float audioElevation=(subLift+bassLift+lowMidLift+midLift+highMidLift)*globalFalloff;',
    'float elevation=idleElevation+audioElevation;',
    sprintf("float rippleR=sin(centerDist*0.12-uTime*0.6)*0.5+0.5;"),
    sprintf("elevation+=rippleR*(1.0-centerDist/%.1f)*uEnergy*2.0;",HALF*1.2),
    'for(int i=0;i<6;i++){float dx=pos2D.x-uDrops[i].x;float dz=pos2D.y-uDrops[i].y;float dt2=sqrt(dx*dx+dz*dz);float ra=uDrops[i].z;float rl=max(0.0,1.0-ra/3.5);elevation+=sin(dt2*0.7-ra*2.5)*exp(-dt2*0.25)*rl*rl*3.5;}',
    'vHeight=elevation/5.0;',
    'vec3 newPosition=position; newPosition.y=elevation;',
    'gl_Position=projectionMatrix*modelViewMatrix*vec4(newPosition,1.0);',
    '}'
  ].join('\n');

  var irregularFragShader = [
    'uniform float uTime,uAudioActivity;',
    'uniform vec3 uBaseColor1,uBaseColor2,uCoolCore,uWarmCore;',
    'uniform float uGlowIntensity;',
    'varying float vHeight; varying vec2 vWorldXZ;',
    'float random(vec2 st){return fract(sin(dot(st,vec2(12.9898,78.233)))*43758.5453);}',
    'void main(){',
    'float SPACING=1.05;',
    'vec2 cellCoord=vWorldXZ/SPACING;',
    'vec2 cellCenter=(floor(cellCoord)+0.5)*SPACING;',
    'vec2 cellLocal=abs(vWorldXZ-cellCenter)/SPACING;',
    'float GAP=0.10;',
    'float edgeDist=0.5-max(cellLocal.x,cellLocal.y);',
    'float gapFactor=smoothstep(0.0,GAP,edgeDist);',
    'float centerDist=length(vWorldXZ);',
    'float normHeight=clamp(vHeight,0.0,1.0);',
    sprintf("float warmBlend=smoothstep(0.0,1.0,0.5-centerDist/%.1f+sin(uTime*0.25)*0.15);",HALF*2),
    'vec3 zoneColor=mix(uCoolCore,uWarmCore,warmBlend);',
    'float rnd=random(cellCenter);',
    sprintf("float MAX_R=%.1f;",HALF*1.02),
    sprintf("float distFade=1.0-smoothstep(MAX_R*0.6,MAX_R,centerDist);"),
    'vec3 glow=mix(uBaseColor2,zoneColor,normHeight*0.85)*uGlowIntensity*distFade;',
    'vec3 body=mix(uBaseColor1,uBaseColor2,normHeight*distFade);',
    'float topInt=clamp(smoothstep(0.0,0.3,normHeight)+0.15,0.0,1.0);',
    'vec3 finalColor=mix(body,glow,topInt);',
    'float sideDarken=mix(0.25,1.0,gapFactor);',
    'finalColor*=sideDarken;',
    'vec3 lightPos=vec3(sin(uTime*0.25)*28.0,10.0,cos(uTime*0.25)*28.0);',
    'vec3 fragPos=vec3(vWorldXZ.x,normHeight*5.0,vWorldXZ.y);',
    'vec3 L=normalize(lightPos-fragPos);',
    'float NdotL=max(0.0,L.y*0.7+0.3);',
    'float spec=pow(NdotL,14.0)*0.38;',
    'float glint=smoothstep(0.06,0.18,edgeDist);',
    'spec*=(0.4+glint*0.6);',
    'finalColor+=zoneColor*spec;',
    sprintf("float aerialFog=smoothstep(MAX_R*0.6,MAX_R,centerDist);"),
    'vec3 atmosphericColor=mix(uBaseColor1,uBaseColor2,0.4);',
    'finalColor=mix(finalColor,atmosphericColor,aerialFog*0.5);',
    sprintf("float circleAlpha=1.0-smoothstep(MAX_R*0.65,MAX_R,centerDist);"),
    sprintf("float alphaFade=circleAlpha;"),
    'float pillarMask=smoothstep(0.0,0.15,gapFactor);',
    'float bgAlpha=mix(0.0,alphaFade,uAudioActivity)*pillarMask;',
    'finalColor=min(finalColor,vec3(1.2));',
    'gl_FragColor=vec4(finalColor,bgAlpha);',
    '}'
  ].join('\n');

  function createIrregularPlane() {
    var SPACING_irr = 1.05;
    var SIZE_irr = GRID * SPACING_irr;
    irregularMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uTime:{value:0}, uSubBass:{value:0}, uBass:{value:0},
        uLowMid:{value:0}, uMid:{value:0}, uHighMid:{value:0},
        uPresence:{value:0}, uBrilliance:{value:0}, uAir:{value:0}, uEnergy:{value:0},
        uAudioActivity:{value:0},
        uBaseColor1:{value:new THREE.Color('#03050a')}, uBaseColor2:{value:new THREE.Color('#080d17')},
        uCoolCore:{value:new THREE.Color('#004dff')}, uWarmCore:{value:new THREE.Color('#ff331a')},
        uGlowIntensity:{value:1.0},
        uDrops:{value:[new THREE.Vector3(180,180,100),new THREE.Vector3(180,180,100),new THREE.Vector3(180,180,100),new THREE.Vector3(180,180,100),new THREE.Vector3(180,180,100),new THREE.Vector3(180,180,100)]}
      },
      vertexShader: irregularVertShader,
      fragmentShader: irregularFragShader,
      transparent: true
    });
    var geo = new THREE.PlaneGeometry(SIZE_irr, SIZE_irr, GRID, GRID);
    geo.rotateX(-Math.PI/2);
    var mesh = new THREE.Mesh(geo, irregularMaterial);
    mesh.visible = false;
    return mesh;
  }

  function updateIrregularUniforms() {
    if (!irregularMaterial) return;
    var u = irregularMaterial.uniforms;
    var a = terrainAudio;
    u.uTime.value = terrainTime;
    u.uSubBass.value = a.subBass; u.uBass.value = a.bass; u.uLowMid.value = a.lowMid;
    u.uMid.value = a.mid; u.uHighMid.value = a.highMid;
    u.uPresence.value = a.presence; u.uBrilliance.value = a.brilliance; u.uAir.value = a.air;
    u.uEnergy.value = a.energy;
    irregularAudioActivity += ((a.energy>0.005?1:0) - irregularAudioActivity) * 0.04;
    u.uAudioActivity.value = irregularAudioActivity;
    var t = terrainTheme;
    u.uBaseColor1.value.copy(t.uBaseColor1);
    u.uBaseColor2.value.copy(t.uBaseColor2);
    u.uCoolCore.value.copy(t.uCoolCore);
    u.uWarmCore.value.copy(t.uWarmCore);
    u.uGlowIntensity.value = t.uGlowIntensity;
    var drops = u.uDrops.value;
    for (var j = 0; j < 6; j++) {
      if (j < rainDrops.length) {
        drops[j].set(rainDrops[j].x, rainDrops[j].z, terrainTime - rainDrops[j].birth);
      } else {
        drops[j].set(180, 180, 100);
      }
    }
  }

  // ─── Init / Clear / Tick / Render ───
  function initTerrain() {
    if (terrainInitialized) return true;
    if (typeof renderer === 'undefined') { console.warn('Terrain: renderer not ready'); return false; }
    if (typeof THREE === 'undefined') { console.warn('Terrain: THREE not loaded'); return false; }
    try {
      terrainScene = new THREE.Scene();
      terrainScene.background = null;

      terrainCamera = new THREE.PerspectiveCamera(52, innerWidth/innerHeight, 0.5, 120);
      terrainCamera.position.set(0, 28, 18);
      terrainCamera.lookAt(0, 0.5, 0);

      // Lighting for pillars
      terrainScene.add(new THREE.AmbientLight(0x667799, 1.2));
      var dirLight = new THREE.DirectionalLight(0xccddff, 1.1);
      dirLight.position.set(15, 25, 10);
      terrainScene.add(dirLight);
      var dirLight2 = new THREE.DirectionalLight(0x7799bb, 0.6);
      dirLight2.position.set(-10, 15, -10);
      terrainScene.add(dirLight2);
      var dirLight3 = new THREE.DirectionalLight(0xff9966, 0.35);
      dirLight3.position.set(0, 8, 20);
      terrainScene.add(dirLight3);

      var sparkLight = new THREE.PointLight(0xffffff, 0.9, 35);
      sparkLight.position.set(0, 12, 0);
      terrainScene.add(sparkLight);
      terrainScene._sparkLight = sparkLight;

      // Pillar InstancedMesh
      buildPillarData();
      var boxGeo = new THREE.BoxGeometry(1, 1, 1);
      var vc = new Float32Array(boxGeo.attributes.position.count * 3);
      vc.fill(1.0);
      boxGeo.setAttribute('color', new THREE.BufferAttribute(vc, 3));
      var pillarMat = new THREE.MeshPhongMaterial({
        specular: 0xffffff,
        shininess: 80,
        transparent: true,
        vertexColors: true
      });
      pillarInstanced = new THREE.InstancedMesh(boxGeo, pillarMat, PILLAR_COUNT);
      pillarInstanced.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      var colorArr = new Float32Array(PILLAR_COUNT * 3); colorArr.fill(0.5); pillarInstanced.instanceColor = new THREE.BufferAttribute(colorArr, 3);
      pillarInstanced.instanceColor.setUsage(THREE.DynamicDrawUsage);
      pillarInstanced.castShadow = false;
      pillarInstanced.receiveShadow = false;
      pillarInstanced.frustumCulled = false;
      pillarInstanced.visible = false;
      terrainScene.add(pillarInstanced);

      // Foam plane
      foamMesh = createFoamPlane();
      terrainScene.add(foamMesh);
      // Irregular plane
      irregularMesh = createIrregularPlane();
      terrainScene.add(irregularMesh);

      applyTerrainTheme('nocturnal');
      terrainInitialized = true;
      console.log('Terrain v3: ' + PILLAR_COUNT + ' pillars + foam plane, size=' + SIZE.toFixed(1));
      return true;
    } catch(e) {
      console.error('Terrain init failed:', e);
      clearTerrainPresetResidue();
      return false;
    }
  }

  function tickTerrain(dt) {
    if (!terrainInitialized) return;
    try {
      updateTerrainAudio();
      updateRaindrops(dt);
      terrainTime += dt;
      if (terrainCamera) {
        terrainCamera.position.x = Math.cos(terrainTime*0.18)*22;
        terrainCamera.position.z = Math.sin(terrainTime*0.18)*22;
        terrainCamera.position.y = 24+Math.sin(terrainTime*0.10)*4;
        terrainCamera.lookAt(0, 0.5, 0);
      }
    } catch(e) {}
  }

  function renderTerrain() {
    if (!terrainInitialized || !terrainScene || !terrainCamera) return false;
    if (typeof renderer === 'undefined') return false;
    try {
      var isTerrain = !!(typeof fx!=='undefined' && fx && Number(fx.preset)===TERRAIN_PRESET_INDEX);
      var isFoam = !!(typeof fx!=='undefined' && fx && typeof TERRAIN_FOAM_PRESET_INDEX!=='undefined' && Number(fx.preset)===TERRAIN_FOAM_PRESET_INDEX);
      var isIrregular = !!(typeof fx!=='undefined' && fx && typeof TERRAIN_IRREGULAR_PRESET_INDEX!=='undefined' && Number(fx.preset)===TERRAIN_IRREGULAR_PRESET_INDEX);
      var active = isTerrain || isFoam || isIrregular;
      if (!active) return false;

      var isPillar = isTerrain;

      if (isFoam && currentThemeName!=='foam_bubble') applyTerrainTheme('foam_bubble');
      else if ((isPillar||isIrregular) && currentThemeName!=='nocturnal') applyTerrainTheme('nocturnal');

      if (pillarInstanced) { pillarInstanced._wasVisible = pillarInstanced.visible; pillarInstanced.visible = isPillar; if (isPillar && !pillarInstanced._wasVisible) pillarInstanced._activity = 0; }
      if (foamMesh) foamMesh.visible = isFoam;
      if (irregularMesh) irregularMesh.visible = isIrregular;

      if (isPillar) updatePillarInstances();
      if (terrainScene._sparkLight && isPillar) { var sl = terrainScene._sparkLight; sl.position.x = Math.cos(terrainTime * 0.4) * 18; sl.position.z = Math.sin(terrainTime * 0.4) * 18; sl.position.y = 10 + Math.sin(terrainTime * 0.7) * 5; }
      if (isFoam) updateFoamUniforms();
      if (isIrregular) updateIrregularUniforms();

      renderer.setClearColor(0x000000, 0);
      renderer.render(terrainScene, terrainCamera);
      return true;
    } catch(e) { return false; }
  }

  function clearTerrainPresetResidue() {
    if (terrainScene) {
      while (terrainScene.children.length > 0) {
        var child = terrainScene.children[0];
        terrainScene.remove(child);
        if (child.geometry) try { child.geometry.dispose(); } catch(e) {}
        if (child.material) try { child.material.dispose(); } catch(e) {}
      }
    }
    if (pillarInstanced) {
      if (pillarInstanced.geometry) try { pillarInstanced.geometry.dispose(); } catch(e) {}
      if (pillarInstanced.material) try { pillarInstanced.material.dispose(); } catch(e) {}
    }
    pillarInstanced = null;
    foamMaterial = null;
    foamMesh = null;
    if (irregularMaterial) try { irregularMaterial.dispose(); } catch(e) {}
    irregularMaterial = null;
    irregularMesh = null;
    pillarData = null;
    terrainScene = null;
    terrainCamera = null;
    terrainInitialized = false;
    terrainTime = 0;
    foamAudioActivity = 0;
    irregularAudioActivity = 0;
    rainDrops = [];
  }

  window.initTerrain = initTerrain;
  window.clearTerrainPresetResidue = clearTerrainPresetResidue;
  window.tickTerrain = tickTerrain;
  window.renderTerrain = renderTerrain;
  window.switchTerrainTheme = applyTerrainTheme;
})();
