import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import { MideaAccessory } from './MideaAccessory';
export declare class MideaPlatform implements DynamicPlatformPlugin {
    readonly log: Logger;
    readonly config: PlatformConfig;
    readonly api: API;
    readonly Service: typeof Service;
    readonly Characteristic: typeof Characteristic;
    readonly accessories: PlatformAccessory[];
    mideaAccessories: MideaAccessory[];
    devices: any;
    midea_beautiful: any;
    cloud: any;
    updateInterval: any;
    appCredentials: any;
    appliances: any;
    refreshTimeout: any;
    constructor(log: Logger, config: PlatformConfig, api: API);
    onReady(): Promise<void>;
    configureAccessory(accessory: PlatformAccessory): void;
    login(): Promise<any>;
    getDeviceList(): Promise<void>;
    updateDevices(): Promise<void>;
    pythonToJson(objectString: any): any;
    onUnload(): void;
}
//# sourceMappingURL=MideaPlatform.d.ts.map