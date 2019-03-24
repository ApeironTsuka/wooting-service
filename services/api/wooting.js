const { EventEmitter } = require('events'),
      { RGB, rgbLedIndex, Keys: LKeys } = require('wooting-sdk/ledcontroller'),
      { Analog, scanIndexArray, Keys: AKeys } = require('wooting-sdk/analogcontroller');
function dcError() { return new Error('disconnected'); }
function getLedKey(isTwo, row, col) {
  let { None } = LKeys;
  if ((row < 0) || (col < 0)) { return None; }
  else if (row >= RGB.Rows) { return None; }
  else if ((!isTwo) && (col >= RGB.ColsOne)) { return None; }
  else if ((isTwo) && (col >= RGB.ColsTwo)) { return None; }
  return rgbLedIndex[row][col];
}
function getAnalogKey(isTwo, row, col) {
  let { None } = AKeys;
  if ((row < 0) || (col < 0)) { return None; }
  else if (row >= Analog.Rows) { return None; }
  else if ((!isTwo) && (col >= Analog.ColsOne)) { return None; }
  else if ((isTwo) && (col >= Analog.ColsTwo)) { return None; }
  return scanIndexArray[row][col];
}
class Layer {
  constructor(isTwo, uid) {
    this.isTwo = !!isTwo;
    this.uid = uid;
    this.map = new Array((isTwo ? 118 : 96) * 4);
    this.map.fill(-1);
  }
  setLoc(row, col, r, g, b, a = 255) { return this.setKey(getLedKey(this.isTwo, row, col), r, g, b, a); }
  setKey(key, r, g, b, a = 255) {
    let { map } = this;
    if ((key < 0) || (key >= (this.isTwo ? 118 : 96))) { return false; }
    map[key * 4] = r;
    map[key * 4 + 1] = g;
    map[key * 4 + 2] = b;
    map[key * 4 + 3] = a;
    return true;
  }
  resetLoc(row, col) { return this.resetKey(getLedKey(this.isTwo, row, col)); }
  resetKey(key) {
    let { map } = this;
    if ((key < 0) || (key >= (this.isTwo ? 118 : 96))) { return false; }
    map[key * 4] = map[key * 4 + 1] = map[key * 4 + 2] = map[key * 4 + 3] = -1;
    return true;
  }
  fillColormap(r, g, b, alpha = 255) {
    let { map } = this;
    for (let i = 0, l = (this.isTwo ? 118 : 96); i < l; i++) {
      map[i * 4] = r;
      map[i * 4 + 1] = g;
      map[i * 4 + 2] = b;
      map[i * 4 + 3] = alpha;
    }
    return true;
  }
  setColormap(map) {
    let { map: tmap } = this;
    for (let i = 0, l = Math.min(map.length, tmap.length); i < l; i++) { tmap[i] = map[i]; }
    return true;
  }
  setColormapNoAlpha(map, alpha = 255) {
    let { map: tmap } = this;
    for (let i = 0, l = (this.isTwo ? 118 : 96); i < l; i++) {
      tmap[i * 4] = map[i * 3];
      tmap[i * 4 + 1] = map[i * 3 + 1];
      tmap[i * 4 + 2] = map[i * 3 + 2];
      tmap[i * 4 + 3] = alpha;
    }
    return true;
  }
}
class wootingConsts extends EventEmitter {
  get Analog() { return AKeys; }
  get LEDs() { return LKeys; }
}
class wootingClientApi extends wootingConsts {
  constructor(emitter) {
    super();
    this.emitter = emitter;
    emitter.api = this;
    emitter.on('profileChanged', (d) => this.emit('profileChanged', d.index, d.map));
    emitter.on('analogUpdate', ({ update }) => {
      let { allKeys } = this, { total, keys } = update;
      allKeys.fill(0);
      for (let i = 1, l = keys.length; i < l; i += 2) { allKeys[keys[i - 1]] = keys[i] & 0xff; }
      this.emit('analogUpdate', update);
    });
    emitter.on('shutdown', () => this.emit('shutdown'));
    this.getKeyboardInfo().then(({ firmware, isTwo, isANSI, profile }) => {
      this.firmware = firmware;
      this.isTwo = isTwo;
      this.isOne = !isTwo;
      this.isANSI = isANSI;
      this.isISO = !isANSI;
      this.allKeys = new Array(isTwo ? 117 : 96);
      this.allKeys.fill(0);
      this.profile = profile;
      this.emit('ready');
    });
  }
  getKeyboardInfo() {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: 'getKeyboardInfo', data: {}, callback: resolve }));
  }
  registerLayer(name) {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: 'registerLayer', data: { name }, callback: resolve }));
  }
  unregisterLayer(uid) {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: 'unregisterLayer', data: { uid }, callback: resolve }));
  }
  updateLayer(uid, layer, alpha) {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: 'updateLayer', data: { uid, map: layer.map, alpha }, callback: resolve }));
  }
  watchAnalog() {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: 'watch-analog', data: {}, callback: resolve }));
  }
  unwatchAnalog() {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: 'unwatchAnalog', data: {}, callback: resolve }));
  }
  watchProfile() {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: 'watchProfile', data: {}, callback: resolve }));
  }
  unwatchProfile() {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: 'unwatchProfile', data: {}, callback: resolve }));
  }
  hideLayer(uid) {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: 'hideLayer', data: { uid }, callback: resolve }));
  }
  showLayer(uid) {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: 'showLayer', data: { uid }, callback: resolve }));
  }

  getLayers() {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: 'getLayers', data: {}, callback: resolve }));
  }
  moveLayer(uid, index) {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: 'moveLayer', data: { uid, index }, callback: resolve }));
  }

  getAnalogKey(row, col) { return getAnalogKey(this.isTwo, row, col); }
  getLedKey(row, col) { return getLedKey(this.isTwo, row, col); }
  readLoc(row, col) { return this.readKey(getAnalogKey(this.isTwo, row, col)); }
  readKey(key) {
    if (key < 0) { return 0; }
    else if (key == AKeys.None) { return 0; }
    else if ((this.isTwo) && (key > 117)) { return 0; }
    else if ((!this.isTwo) && (key > 96)) { return 0; }
    return this.allKeys[key];
  }
  readFull() {
    let keys = new Array(), written = 0, { allKeys } = this, k = 0;
    for (let i = 0, l = allKeys.length; i < l; i++) { if (allKeys[i] > 0) { keys[k++] = i; keys[k++] = allKeys[i]; written++; } }
    return { total: written, keys };
  }
  
  get Layer() { return Layer; }
  get LayerInst() { return new Layer(this.isTwo); }
}
class wootingServerApi extends wootingConsts {
  constructor(emitter) { super(); this.emitter = emitter; emitter.api = this; }
  profileChanged(index, map) { this.emitter.send({ event: 'profileChanged', data: { index, map } }); }
  analog(update) { this.emitter.send({ event: 'analogUpdate', data: { update } }); }
  shutdown() { this.emitter.send({ event: 'shutdown', data: {} }); }
}
module.exports = function (emitter, isServer) { return (isServer ? new wootingServerApi(emitter) : new wootingClientApi(emitter)); }
