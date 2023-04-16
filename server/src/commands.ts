import * as alt from 'alt-server';
import * as Athena from '@AthenaServer/api';
import { LOCALE_KEYS } from '../../../../shared/locale/languages/keys';
import { LocaleController } from '../../../../shared/locale/locale';
import { BARBER_SHOP_LOCALE } from '../../shared/locales';
import { BarbershopView } from './view';

export class BarbershopCommands {
    static init() {
        Athena.systems.messenger.commands.register(
            'barber',
            '/barber - Open Barbershop',
            ['admin'],
            BarbershopView.open,
        );

        Athena.systems.messenger.commands.register(
            'boffer',
            BARBER_SHOP_LOCALE.COMMAND_BOFFER,
            [],
            BarbershopCommands.handleBarbershopOffer,
        );

        Athena.systems.messenger.commands.register(
            'baccept',
            BARBER_SHOP_LOCALE.COMMAND_BACCEPT,
            [],
            BarbershopCommands.handleBarbershopAccept,
        );

        alt.log(`Barbershop Commands Initialized`);
    }

    private static handleBarbershopOffer(hairDresser: alt.Player, id: string) {
        // Some kind of item check...
        if (typeof id === 'undefined') {
            Athena.player.emit.message(hairDresser, BARBER_SHOP_LOCALE.COMMAND_BOFFER);
            return;
        }

        const customer = Athena.systems.identifier.getPlayer(id);
        if (!customer || !customer.valid) {
            Athena.player.emit.message(hairDresser, LocaleController.get(LOCALE_KEYS.CANNOT_FIND_PLAYER));
            return;
        }

        BarbershopView.offer(hairDresser, customer);
    }

    private static handleBarbershopAccept(customer: alt.Player, id: string) {
        // Some kind of item check...
        if (typeof id === 'undefined') {
            Athena.player.emit.message(customer, BARBER_SHOP_LOCALE.COMMAND_BACCEPT);
            return;
        }

        BarbershopView.accept(customer, parseInt(id));
    }
}
