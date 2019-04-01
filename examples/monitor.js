const { wootingClient, Layer } = require('wooting-ipc'),
      cp = require('child_process'),
      sensors = require('sensors.js'),
      smi = require('node-nvidia-smi'),
      cpuStat = require('cpu-stat');
const cmap = [
  [ 0, 0, 255 ], // blue
  [ 0, 255, 255 ], // cyan
  [ 255, 255, 0 ], // yellow
  [ 255, 127, 0 ], // orange
  [ 255, 0, 0 ] // red
];
let kb = new wootingClient(), xss;
kb.connect();
kb.on('ready', init);
kb.on('disconnected', () => {
  xss.kill();
  clearInterval(sensor.tmr);
  clearInterval(init.tmr);
});
function sensorsPromise() { return new Promise((res, rej) => { sensors.sensors((data, err) => { if (err) { rej(err); return; } res(data); }); }); }
function smiPromise() { return new Promise((res, rej) => { smi((err, data) => { if (err) { rej(err); return; } res(data); }); }); }
function cpuStatPromise(core) {
  return new Promise((res, rej) => {
    let o = { sampleMs: 200 };
    if ((core !== undefined) && (core != -1)) { o.coreIndex = core; }
    cpuStat.usagePercent(o, (err, percent, sec) => {
      if (err) { rej(err); return; }
      res(percent);
    });
  });
}
function blend(a,b,x) { if (a == b) { return a; } return Math.floor((a * x) + (b * (1 - x))); }
function tempToColor(t) {
  let out = [], x = (t % 20) / 20, c1, c2;
  if (t >= 100) { c1 = c2 = 4; }
  else if (t < 20) { c1 = c2 = 0; }
  else { c2 = Math.floor(t / 20); c1 = c2-1; }
  if (c1 == c2) { out = cmap[c1]; }
  else { for (let i = 0; i < 3; i++) { out[i] = blend(cmap[c2][i], cmap[c1][i], x); } }
  return out;
}
function printNum(n, row) {
  let r, g, b, o = row == 4 && kb.isANSI ? 2 : 1;
  b = Math.floor(n / 10); n -= b * 10;
  g = Math.floor(n / 5); n -= g * 5;
  r = n;
  for (let i = o; i < b + o; i++) { leds.setLoc(row, i, 0, 0, 255); } o += b;
  for (let i = o; i < g + o; i++) { leds.setLoc(row, i, 0, 255, 0); } o += g;
  for (let i = o; i < r + o; i++) { leds.setLoc(row, i, 255, 0, 0); }
}
let sensor, sleep;
class sensorsLayer extends Layer {}
class sleepLayer extends Layer {
  constructor(...args) { super(...args); this.enabled = false; this.pause = false; this.dir = -3; kb.hideOwnLayer(this); }
  tick() {
    let { brightness, dir } = this;
    if ((!this.pause) && (brightness >= 100)) {
      sleep.enabled = false;
      kb.hideOwnLayer(this);
      return;
    }
    brightness += dir;
    if (brightness <= 10) { dir = -dir; }
    else if (brightness >= 100) { dir = -dir; }
    this.brightness = brightness;
    this.dir = dir;
    this.fillColormap(1, 1, 1, Math.floor(255*((100-brightness)/100)));
  }
}
function init() {
  console.log(`Found Keyboard\nIt's a ${kb.model}\nFirmware version: ${kb.firmware}`);
  let arr = [
    kb.registerOwnLayer('sensor').then((uid) => { sensor = new sensorsLayer(kb, uid); }),
    kb.registerOwnLayer('sleep', 'Sleeeeeeeep', 100).then((uid) => { sleep = new sleepLayer(kb, uid); })
  ];
  Promise.all(arr).then(() => {
    sensor.enabled = true; sleep.enabled = false;
    init.tmr = setInterval(() => {
      kb.updateOwnLayer(sensor).catch(() => clearInterval(tmr));
      if (sleep.enabled) { sleep.tick(); kb.updateOwnLayer(sleep).catch(() => clearInterval(tmr)); }
    }, 200);
    initSensors();
    initSleep();
  });
}
function initSensors() {
  console.log('Begin watching CPU/GPU load/temps..');
  sensor.tmr = setInterval(() => {
    let keys = [];
    sensorsPromise()
    .then((data) => {
      let d = data['coretemp-isa-0000']['ISA adapter'], exit = false;
      keys.push({ key: 'F1', v: tempToColor(d['Package id 0'].value) });
      for (let i = 0; i < 11; i++) {
        if (!d[`Core ${i}`]) { break; }
        keys.push({ key: `F${i+2}`, v: tempToColor(d[`Core ${i}`].value*1.2) });
      }
    })
    .then(smiPromise)
    .then((data) => {
      keys.push({ key: 'Escape', v: tempToColor(parseInt(data.nvidia_smi_log.gpu.temperature.gpu_temp)) });
      keys.push({ key: 'Backspace', v: tempToColor(parseInt(data.nvidia_smi_log.gpu.utilization.gpu_util)) });
    })
    .then(() => {
      let arr = [];
      for (let i = -1, l = Math.max(cpuStat.totalCores(), 12); i < l; i++) { arr.push(cpuStatPromise(i)); }
      return Promise.all(arr);
    })
    .then((load) => {
      for (let i = 0, l = load.length; i < l; i++) {
        switch (i) {
          case  0: keys.push({ key: 'Tilde', v: tempToColor(load[i]) }); break;
          case 10: keys.push({ key: 'Number0', v: tempToColor(load[i]) }); break;
          case 11: keys.push({ key: 'Underscore', v: tempToColor(load[i]) }); break;
          case 12: keys.push({ key: 'Plus', v: tempToColor(load[i]) }); break;
          default: keys.push({ key: `Number${i}`, v: tempToColor(load[i]) }); break;
        }
      }
    })
    .then(() => {
      let { LEDs } = kb, key;
      for (let i = 0, l = keys.length; i < l; i++) { key = keys[i]; sensor.setKey(LEDs[key.key], ...key.v); }
    })
    .catch((err) => { console.log(err.stack); });
  }, 200);
}
function initSleep() {
  let tmr;
  xss = cp.spawn('xscreensaver-command', [ '--watch' ]);
  xss.stdout.on('data', (d) => {
    let words = d.toString().split(/ /);
    switch (words[0]) {
      case 'BLANK':
        tmr = setTimeout(() => {
          console.log('Screensaver kicked in, entering "sleep" mode..');
          sleep.brightness = 100;
          sleep.enabled = true;
          kb.showOwnLayer(sleep);
          sleep.pause = true;
          tmr = null;
        }, 5000);
        break;
      case 'UNBLANK':
        if (tmr) { clearTimeout(tmr); break; }
        console.log('Screensaver ended, waking from "sleep"..');
        sleep.enabled = true;
        sleep.pause = false;
        if (sleep.dir < 0) { sleep.dir = -sleep.dir; }
        break;
      default: break;
    }
  });
}
