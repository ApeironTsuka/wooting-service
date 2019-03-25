'use strict';
const { extendedApiBaseClass } = require('tserv-service');
function dcError() { return new Error('disconnected'); }
class configClientApi extends extendedApiBaseClass {
  getLayers() {
    if (!this.p.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.p.send({ event: 'config-getLayers', data: {}, callback: resolve }));
  }
  moveLayer(uid, z) {
    if (!this.p.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.p.send({ event: 'config-moveLayer', data: { uid, z }, callback: resolve }));
  }
  showLayer(uid) {
    if (!this.p.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.p.send({ event: 'config-showLayer', data: { uid }, callback: resolve }));
  }
  hideLayer(uid) {
    if (!this.p.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.p.send({ event: 'config-hideLayer', data: { uid }, callback: resolve }));
  }
}
function configServerApi(main, api) {}
function apiFactory(main, api, isServer) {
  if (isServer) { return configServerApi(main, api); }
  else { return configClientApi; }
}
module.exports = apiFactory;
