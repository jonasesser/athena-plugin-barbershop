import alt from 'alt-server';
import * as Athena from '@AthenaServer/api/index.js';
import { BarbershopCommands } from './src/commands.js';
import { BarbershopView } from './src/view.js';

const PLUGIN_NAME = 'Athena Barbershops';

Athena.systems.plugins.registerPlugin(PLUGIN_NAME, () => {
    BarbershopView.init();
    BarbershopCommands.init();

    alt.log(`~lg~CORE ==> ${PLUGIN_NAME} Loaded.`);
});
