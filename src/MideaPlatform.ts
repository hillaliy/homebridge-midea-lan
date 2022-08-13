import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';

import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import { MideaAccessory } from './MideaAccessory';

const { py, python } = require('pythonia');

export class MideaPlatform implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;
  public readonly accessories: PlatformAccessory[] = [];
  mideaAccessories: MideaAccessory[] = [];

  midea_beautiful: any;
  cloud: any;
  updateInterval: any = null;
  refreshTimeout: any = null;
  appCredentials: any;
  appliances: any;
  devices: any = [];

  accessToken: string = '';
  key: string = '';

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    this.log.debug('Finished initializing platform:', this.config.name);
    this.log = log;
    this.config = config;

    this.appCredentials = {
      NetHomePlus: {
        appkey: "3742e9e5842d4ad59c2db887e12449f9",
        appid: 1017,
        api_url: "https://mapp.appsmb.com",
        sign_key: "xhdiwjnchekd4d512chdjx5d8e4c394D2D7S",
        proxied: null,
      },
      MideaAir: {
        appkey: "ff0cf6f5f0c3471de36341cab3f7a9af",
        appid: 1117,
        api_url: "https://mapp.appsmb.com",
        sign_key: "xhdiwjnchekd4d512chdjx5d8e4c394D2D7S",
        proxied: null,
      },
      MSmartHome: {
        appkey: "ac21b9f9cbfe4ca5a88562ef25e2b768",
        appid: 1010,
        api_url: "https://mp-prod.appsmb.com/mas/v5/app/proxy?alias=",
        sign_key: "xhdiwjnchekd4d512chdjx5d8e4c394D2D7S",
        iotkey: "meicloud",
        hmackey: "PROD_VnoClJI9aikS8dyy",
        proxied: "v5",
      },
    };
    api.on('didFinishLaunching', () => {
      this.onReady();
      // this.onUnload();
      // this.onStateChange;
      this.log.debug('Executed didFinishLaunching callback');
    });
  }

  async onReady() {
    try {
      this.midea_beautiful = await python('midea_beautiful');
      this.log.debug('Load "midea_beautiful" successful');
      this.cloud = await this.login();
      try {
        await this.getDeviceList();
        await this.updateDevices();
      } catch (error) {
        this.log.debug('getDeviceList failed');
      }
      this.updateInterval = setInterval(() => {
        this.updateDevices();
      }, this.config['interval'] * 60 * 1000);
    } catch (error) {
      this.log.debug('Load "midea_beautiful" failed');
    }
  }

  configureAccessory(accessory: PlatformAccessory) {
    this.log.info(`Loading accessory from cache: ${accessory.displayName}`);
    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }

  async login() {
    try {
      const cloud = await this.midea_beautiful.connect_to_cloud$({
        account: this.config['user'],
        password: this.config['password'],
        ...this.appCredentials[this.config['appCredentials']],
      });
      const cloudDict = await cloud.__dict__;
      this.log.debug(cloudDict);
      // this.accessToken = cloudDict.accessToken;
      // console.log(this.accessToken)
      // this.key = cloudDict.key;

      // console.log(this.key)
      this.log.info('Login successful');
      // this.setState("info.connection", true, true);
      return cloud;
    } catch (error: any) {
      this.log.error(error);
    }
  }

  async getDeviceList() {
    try {
      this.log.info('Getting devices');
      this.appliances = await this.midea_beautiful.find_appliances$({
        cloud: this.cloud,
      });
      this.log.debug(`Found ${await this.appliances.length} devices`);

      for await (const [index, app] of await py.enumerate(this.appliances)) {
        this.log.debug(await app);
        const appJsonString = this.pythonToJson(
          await app.state.__dict__.__str__(),
        );
        const appJson = JSON.parse(appJsonString);
        const id = appJson.id;
        this.devices[id] = appJson;

        let deviceType: any;
        if (appJson.type === 'ac') {
          deviceType = 172;
        } else if (appJson.type === 'dh') {
          deviceType = 161;
        } else {
          this.log.warn(`Device: ${appJson.name} is of unsupported type: ${appJson.type}`)
          this.log.warn('Please open an issue on GitHub with your specific device model')
        }

        const uuid = this.api.hap.uuid.generate(appJson.id);
        const existingAccessory = this.accessories.find(accessory => accessory.UUID === uuid);

        if (existingAccessory) {
          this.log.debug(`Restoring existing accessory from cache: ${existingAccessory.displayName}`);
          existingAccessory.context.deviceId = appJson.id;
          existingAccessory.context.name = appJson.name;
          existingAccessory.context.type = deviceType;
          existingAccessory.context.address = appJson.address;

          this.api.updatePlatformAccessories([existingAccessory]);

          const ma = new MideaAccessory(this, existingAccessory, appJson.id, deviceType, appJson.name, appJson.address);
          this.mideaAccessories.push(ma);

          this.configureAccessory(existingAccessory);
        } else {
          this.log.debug(`Adding new device: ${appJson.name}`);
          const accessory = new this.api.platformAccessory(appJson.name, uuid);
          accessory.context.deviceId = appJson.id;
          accessory.context.name = appJson.name;
          accessory.context.type = deviceType;
          accessory.context.address = appJson.address;

          const ma = new MideaAccessory(this, accessory, appJson.id, deviceType, appJson.name, appJson.address);
          this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
          this.mideaAccessories.push(ma);

          this.configureAccessory(accessory);
        }
      }
    } catch (error: any) {
      this.log.error(error);
    }
  }

  async updateDevices() {
    try {
      this.accessories.forEach(async (accessory: PlatformAccessory) => {
        this.log.debug(`Updating accessory: ${accessory.context.name} (${accessory.context.deviceId})`)
        let applianceType: any;
        if (accessory.context.type === 172) {
          applianceType = 'ac';
        } else if (accessory.context.type === 161) {
          applianceType = 'dh';
        }
        let applianceState: any;

        if (accessory.context.address) {
          this.log.debug(`Update device ${accessory.context.name} (${accessory.context.deviceId}) via lan`);
          applianceState = await this.midea_beautiful.appliance_state$({
            address: accessory.context.address,
            token: accessory.context.token,
            key: accessory.context.key,
            appliance_id: accessory.context.deviceId,
          });
        } else {
          this.log.debug(`Update device ${accessory.context.name} (${accessory.context.deviceId}) via cloud`);
          applianceState = await this.midea_beautiful.appliance_state$({
            cloud: this.cloud,
            use_cloud: true,
            appliance_id: accessory.context.deviceId,
            appliance_type: applianceType,
          });
        };

        this.log.debug(await applianceState);
        const stateString = this.pythonToJson(
          await applianceState.state.__dict__.__str__(),
        );
        const stateJson = JSON.parse(stateString);
        let mideaAccessory: any = this.mideaAccessories.find(ma => ma.deviceId === accessory.context.deviceId)

        mideaAccessory.powerState = stateJson.running ? 1 : 0;
        mideaAccessory.beepPrompt = stateJson.beep_prompt;
        mideaAccessory.operationalMode = stateJson.mode;
        mideaAccessory.fanSpeed = stateJson.fan_speed;
        mideaAccessory.verticalSwing = stateJson.vertical_swing;
        mideaAccessory.horizontalSwing = stateJson.horizontal_swing;
        if (accessory.context.type === 172) {
          mideaAccessory.targetTemperature = stateJson.target_temperature;
          mideaAccessory.indoorTemperature = stateJson.indoor_temperature;
          mideaAccessory.outdoorTemperature = stateJson.outdoor_temperature;
          mideaAccessory.useFahrenheit = stateJson.fahrenheit;
          mideaAccessory.turboFan = stateJson.turbo_fan;
          mideaAccessory.ecoMode = stateJson.eco_mode;
          mideaAccessory.turboMode = stateJson.turbo;
          mideaAccessory.purifier = stateJson.purifier;
          mideaAccessory.dryer = stateJson.dryer;
          mideaAccessory.comfortSleep = stateJson.comfort_sleep;
          mideaAccessory.showScreen = stateJson.show_screen;

          this.log.debug(`\nPower state: ${mideaAccessory.powerState}\nBeep prompt: ${mideaAccessory.beepPrompt}\nOperational mode: ${mideaAccessory.operationalMode}\nFan speed: ${mideaAccessory.fanSpeed}\nTarget temperature: ${mideaAccessory.targetTemperature}\nIndoor temperature: ${mideaAccessory.indoorTemperature}\nOutdoor temperature: ${mideaAccessory.outdoorTemperature}\nVertical swing: ${mideaAccessory.verticalSwing}\nHorizontal swing: ${mideaAccessory.horizontalSwing}\nFahrenheit: ${mideaAccessory.useFahrenheit}\nturbo fan: ${mideaAccessory.turboFan}\nEco mode: ${mideaAccessory.ecoMode}\nTurbo mode: ${mideaAccessory.turboMode}\nPurifier: ${mideaAccessory.purifier}\nDryer: ${mideaAccessory.dryer}\nComfort sleep: ${mideaAccessory.comfortSleep}\nShow screen: ${mideaAccessory.showScreen}`)

        } else if (accessory.context.type === 161) {
          mideaAccessory.currentHumidity = stateJson.current_humidity;
          mideaAccessory.targetHumidity = stateJson.target_humidity;
          mideaAccessory.tankLevel = stateJson.tank_level;

          this.log.debug(`\nPower state: ${mideaAccessory.powerState}\nBeep prompt: ${mideaAccessory.beepPrompt}\nOperational mode: ${mideaAccessory.operationalMode}\nFan speed: ${mideaAccessory.fanSpeed}\nCurrent humidity: ${mideaAccessory.currentHumidity}\nTarget humidity: ${mideaAccessory.targetHumidity}\nTank level: ${mideaAccessory.tankLevel}\nVertical swing: ${mideaAccessory.verticalSwing}\nHorizontal swing: ${mideaAccessory.horizontalSwing}`)
        }
      })
    } catch (error: any) {
      this.log.error(error);
    }
  }

  async sendUpdateToDevice(device?: MideaAccessory) {
    if (device) {
      // const deviceId = id.split(".")[2];
      // console.log(deviceId)
      const command: any = device.deviceId.split(".").pop;
      const index = Object.keys(this.devices).indexOf(device.deviceId);
      const appliance = await this.appliances[index];
      const setState = { cloud: this.cloud };
      let cmd: any = [];
      cmd.running = device.powerState
      cmd.beep_prompt = device.beepPrompt;
      cmd.mode = device.operationalMode;
      cmd.fan_speed = device.fanSpeed;
      cmd.vertical_swing = device.verticalSwing;
      cmd.horizontal_swing = device.horizontalSwing;
      if (device.deviceType === 172) {
        cmd.target_temperature = device.targetTemperature;
        cmd.fahrenheit = device.useFahrenheit;
        cmd.turbo_fan = device.turboFan;
        cmd.eco_mode = device.ecoMode;
        cmd.turbo = device.turboMode;
        cmd.purifier = device.purifier;
        cmd.dryer = device.dryer;
        cmd.comfort_sleep = device.comfortSleep;
        cmd.show_screen = device.showScreen;
      } else if (device.deviceType === 161) {
        cmd.current_humidity = device.currentHumidity;
        cmd.target_humidity = device.targetHumidity;
        cmd.tank_level = device.tankLevel;
      }
      setState[command] = cmd;
      this.log.debug(`Send command to: ${device.name} (${device.deviceId})\n${cmd}`);
      this.log.debug(JSON.stringify(setState));

      try {
        await appliance.set_state$(setState);
      } catch (error: any) {
        this.log.error(error);
      }
    };
  };

  pythonToJson(objectString: any) {
    objectString = objectString
      .replaceAll(/b'[^']*'/g, '\'\'')
      .replaceAll(/: <[^<]*>,/g, ':\'\',')
      .replaceAll('{\'_', '{\'')
      .replaceAll(', \'_', ', \'')
      .replaceAll('\'', '"')
      .replaceAll(' None,', 'null,')
      .replaceAll(' True,', 'true,')
      .replaceAll(' False,', 'false,');

    this.log.debug(objectString);
    return objectString;
  };

  getDeviceSpecificOverrideValue(deviceId: string, key: string) {
    if (this.config) {
      if (this.config.hasOwnProperty('devices')) {
        for (let i = 0; i < this.config.devices.length; i++) {
          if (this.config.devices[i].deviceId === deviceId) {
            return this.config.devices[i][key];
          };
        };
      };
    };
    return null;
  };
};