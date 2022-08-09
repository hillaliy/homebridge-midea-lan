"use strict";
const settings_1 = require("./settings");
const MideaPlatform_1 = require("./MideaPlatform");
module.exports = (api) => {
    api.registerPlatform(settings_1.PLATFORM_NAME, MideaPlatform_1.MideaPlatform);
};
//# sourceMappingURL=index.js.map