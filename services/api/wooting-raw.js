'use strict';
const { extendedApiBaseClass } = require('tserv-service');
function dcError() { return new Error('disconnected'); }
function rawClientApi extends extendedApiBaseClass {
  takeControl() {
    if (!this.p.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.p.send({ event: 'raw-takeControl', data: {}, callback: resolve }));
  };
  releaseControl() {
    if (!this.p.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.p.send({ event: 'raw-releaseControl', data: {}, callback: resolve }));
  }
  sendFeatureRequest(buf) {
    if (!this.p.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.p.send({ event: 'raw-feature', data: { buf }, callback: resolve }));
  }
  sendBuffer(buf) {
    if (!this.p.isConnected) { return Promise.reject(dcError()); }
    return new Promise((resolve, reject) => this.p.send({ event: 'raw-buffer', data: { buf }, callback: resolve }));
  }
}
function rawServerApi(main, api) {}
function apiFactory(main, api, isServer) {
  if (isServer) { return rawServerApi(main, api); }
  else { return rawClientApi; }
}
module.exports = apiFactory;
