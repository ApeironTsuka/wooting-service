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
  get RegisterLayer() { return 0; }
  get UnregisterLayer() { return 1; }
  get UpdateLayer() { return 2; }
  get WatchAnalog() { return 3; }
  get UnwatchAnalog() { return 4; }
  get WatchProfile() { return 5; }
  get UnwatchProfile() { return 6; }
  get ProfileChanged() { return 7; }
  get AnalogUpdate() { return 8; }
  get Shutdown() { return 9; }
  get GetKeyboardInfo() { return 10; }
  get TakeControl() { return 11; }
  get ReleaseControl() { return 12; }
  get Feature() { return 13; }
  get Buffer() { return 14; }
  get HideLayer() { return 15; }
  get ShowLayer() { return 16; }
  get Analog() { return AKeys; }
  get LEDs() { return LKeys; }
}
class wootingClientApi extends wootingConsts {
  constructor(emitter) {
    super();
    this.emitter = emitter;
    emitter.api = this;
    emitter.on(this.ProfileChanged, (d) => this.emit(this.ProfileChanged, d.index, d.map));
    emitter.on(this.AnalogUpdate, ({ update }) => {
      let { allKeys } = this, { total, keys } = update;
      allKeys.fill(0);
      for (let i = 1, l = keys.length; i < l; i += 2) { allKeys[keys[i - 1]] = keys[i] & 0xff; }
      this.emit(this.AnalogUpdate, update);
    });
    emitter.on(this.Shutdown, () => this.emit(this.Shutdown));
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
    return new Promise((resolve, reject) => this.emitter.send({ event: this.GetKeyboardInfo, data: {}, callback: resolve }));
  }
  registerLayer(name) {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: this.RegisterLayer, data: { name }, callback: resolve }));
  }
  unregisterLayer(uid) {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: this.UnregisterLayer, data: { uid }, callback: resolve }));
  }
  updateLayer(uid, layer, alpha) {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: this.UpdateLayer, data: { uid, map: layer.map, alpha }, callback: resolve }));
  }
  watchAnalog() {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: this.WatchAnalog, data: {}, callback: resolve }));
  }
  unwatchAnalog() {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: this.UnwatchAnalog, data: {}, callback: resolve }));
  }
  watchProfile() {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: this.WatchProfile, data: {}, callback: resolve }));
  }
  unwatchProfile() {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: this.UnwatchProfile, data: {}, callback: resolve }));
  }
  hideLayer(uid) {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: this.HideLayer, data: { uid }, callback: resolve }));
  }
  showLayer(uid) {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: this.ShowLayer, data: { uid }, callback: resolve }));
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

  takeControl() {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: this.TakeControl, data: {}, callback: resolve }));
  }
  releaseControl() {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: this.ReleaseControl, data: {}, callback: resolve }));
  }
  sendFeatureRequest(buf) {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: this.Feature, data: { buf }, callback: resolve }));
  }
  sendBuffer() {
    if (!this.emitter.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.emitter.send({ event: this.Buffer, data: { buf }, callback: resolve }));
  }
}
class wootingServerApi extends wootingConsts {
  constructor(emitter) { super(); this.emitter = emitter; emitter.api = this; }
  profileChanged(index, map) { this.emitter.send({ event: this.ProfileChanged, data: { index, map } }); }
  analog(update) { this.emitter.send({ event: this.AnalogUpdate, data: { update } }); }
  shutdown() { this.emitter.send({ event: this.Shutdown, data: {} }); }
}
module.exports = function (emitter, isServer) { return (isServer ? new wootingServerApi(emitter) : new wootingClientApi(emitter)); }
