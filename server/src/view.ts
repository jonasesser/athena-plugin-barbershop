import * as alt from 'alt-server';
import * as Athena from '@AthenaServer/api';
import { SYSTEM_EVENTS } from '../../../../shared/enums/system';
import { BarbershopEvents } from '../../shared/events';
import { BarbershopData } from '../../shared/interfaces';
import { BARBER_SHOP_LOCATIONS } from '../../shared/locations';
import { BARBER_SHOP_LOCALE } from '../../shared/locales';
import { hairOverlayInfo } from '../../shared/overlays';

/**
 * Offer to cut hair for other players.
 * Key is the Hair Dresser's ID
 * Value is the Hair Dresser's Customer
 * @type {*} */
const offers: { [from: string]: number } = {};

/**
 * Key is the Hair Dresser's ID
 * Value is the Hair Dresser's Customer
 * Can also be same user.
 * @type {*} */
const sessions: { [from: string]: number } = {};

export class InternalFunctions {
    /**
     * Initialize events and functions for handling sessions.
     *
     * @static
     * @memberof InternalFunctions
     */
    static init() {
        alt.on('playerDisconnect', InternalFunctions.handleDisconnect);

        for (const pos of BARBER_SHOP_LOCATIONS) {
            Athena.controllers.blip.append({
                pos: pos,
                color: 43,
                scale: 1,
                shortRange: true,
                text: BARBER_SHOP_LOCALE.BARBERSHOP_LABEL,
                sprite: 71,
            });
            Athena.controllers.marker.append({ pos: pos, color: new alt.RGBA(0, 255, 0, 100), type: 1 });
            Athena.controllers.interaction.append({ position: pos, callback: BarbershopView.open, isPlayerOnly: true });
        }
    }

    /**
     * Automatically ends the hairstyle session if present.
     *
     * @static
     * @param {alt.Player} player
     * @return {*}
     * @memberof InternalFunctions
     */
    static handleDisconnect(hairDresser: alt.Player) {
        const hairDresserID = Athena.systems.identifier.getIdByStrategy(hairDresser);

        if (sessions[hairDresserID] === undefined) {
            return;
        }

        const customer = alt.Player.all.find((x) => x.id.toString() === sessions[hairDresserID].toString());
        delete sessions[hairDresserID];

        if (!customer || !customer.valid) {
            return;
        }

        customer.frozen = true;
        Athena.player.emit.notification(customer, BARBER_SHOP_LOCALE.HAIR_DRESSER_DISCONNECTED);
    }
}

export class BarbershopView {
    /**
     * When the server is ready it binds events.
     */
    static init() {
        InternalFunctions.init();
        alt.onClient(BarbershopEvents.ServerClientEvents.UPDATE, BarbershopView.update);
        alt.onClient(BarbershopEvents.ServerClientEvents.CLOSE, BarbershopView.close);
        alt.onClient(BarbershopEvents.ServerClientEvents.SAVE, BarbershopView.save);
    }

    static async save(hairDresser: alt.Player, data: BarbershopData) {
        try {
            const hairDresserID = Athena.systems.identifier.getIdByStrategy(hairDresser);
            if (sessions[hairDresserID] === undefined) {
                BarbershopView.close(hairDresser);
                return;
            }

            const customer = Athena.systems.identifier.getPlayer(sessions[hairDresserID]);
            if (!customer || !customer.valid) {
                return;
            }

            const customerData = Athena.document.character.get(customer);
            if (customerData.appearance) {
                customerData.appearance.hairDlc = data.dlc;
                customerData.appearance.hair = data.hair;
                customerData.appearance.hairColor1 = data.hairColor1;
                customerData.appearance.hairColor2 = data.hairColor2;
                customerData.appearance.hairOverlay = data.hairFullName
                    ? hairOverlayInfo[data.hairFullName]
                    : { collection: '', overlay: '' };
                customerData.appearance.eyebrows = data.eyeIndex;
                customerData.appearance.eyebrowsOpacity = data.eyeOpacity;
                customerData.appearance.eyebrowsColor1 = data.eyeColor1;
                customerData.appearance.facialHair = data.beardIndex;
                customerData.appearance.facialHairColor1 = data.beardColor1;
                customerData.appearance.facialHairOpacity = data.beardOpacity;

                await Athena.document.character.set(customer, 'appearance', customerData.appearance);
                Athena.player.sync.appearance(customer, customerData);
            }

            BarbershopView.close(hairDresser);
        } catch (e) {
            console.log(e);
        }
    }

    /**
     * It's a function that takes a player as an argument, and if the player is a hairdresser, it will
     * close the session for the hairdresser and free the customer.
     *
     * @param hairDresser - alt.Player - The player who is the hairdresser.
     * @returns the value of the variable "hairDresserID"
     */
    static async close(hairDresser: alt.Player, doNotSync = false) {
        const hairDresserID = Athena.systems.identifier.getIdByStrategy(hairDresser);

        if (sessions[hairDresserID] === undefined) {
            alt.emitClient(hairDresser, BarbershopEvents.ServerClientEvents.CLOSE, true);
            return;
        }

        const customer = Athena.systems.identifier.getPlayer(sessions[hairDresserID]);
        delete sessions[hairDresserID];
        if (!customer || !customer.valid) {
            alt.emitClient(hairDresser, BarbershopEvents.ServerClientEvents.CLOSE, true);
            return;
        }

        customer.frozen = false;

        if (doNotSync) {
            return;
        }

        const customerData = Athena.document.character.get(customer);

        if (!customerData.appearance) {
            return;
        }

        await Athena.document.character.set(customer, 'appearance', customerData.appearance);
        Athena.player.sync.appearance(customer, customerData);
    }

    /**
     * Sends an offer from a hair dresser to a customer.
     * If the customer is 'self' then it will automatically open the WebView.
     *
     * @static
     * @param {alt.Player} hairDresser
     * @param {alt.Player} customer
     * @return {*}
     * @memberof BarbershopView
     */
    static offer(hairDresser: alt.Player, customer: alt.Player) {
        const hairDresserID = Athena.systems.identifier.getIdByStrategy(hairDresser);
        const customerID = Athena.systems.identifier.getIdByStrategy(customer);

        if (hairDresserID === customerID) {
            sessions[hairDresserID] = customerID;
            BarbershopView.open(hairDresser);
            return;
        }

        offers[hairDresserID] = customerID;

        Athena.player.emit.message(
            hairDresser,
            `${BARBER_SHOP_LOCALE.HAVE_OFFERED} ${customer.name} ${BARBER_SHOP_LOCALE.AS_HAIRCUT_SESSION}`,
        );
        Athena.player.emit.message(
            customer,
            `${BARBER_SHOP_LOCALE.HAVE_BEEN_OFFERED_A_HAIRCUT_SESSION_BY} ${hairDresser.name}. /hairaccept ${hairDresserID}`,
        );
    }

    /**
     * Starts a haircut session with a hair dresser that has offered to cut.
     * Customer must specify their ID to accept it.
     *
     * As well as be in range.
     *
     * @static
     * @param {alt.Player} customer
     * @return {void}
     * @memberof BarbershopView
     */
    static accept(customer: alt.Player, _hairDresserID: number): void {
        const hairDresser = Athena.systems.identifier.getPlayer(_hairDresserID);

        if (!hairDresser || !hairDresser.valid) {
            Athena.player.emit.notification(customer, BARBER_SHOP_LOCALE.CANNOT_FIND_THE_HAIRDRESSER);
            return;
        }

        if (!offers[_hairDresserID] || typeof _hairDresserID === 'undefined') {
            Athena.player.emit.notification(customer, BARBER_SHOP_LOCALE.CANNOT_FIND_THE_HAIRDRESSER);
            return;
        }

        const customerID = Athena.systems.identifier.getIdByStrategy(customer);
        if (offers[_hairDresserID].toString() !== customerID.toString()) {
            Athena.player.emit.notification(customer, BARBER_SHOP_LOCALE.HAIRDRESSER_IS_WITH_CUSTOMER);
            return;
        }

        delete offers[_hairDresserID];
        sessions[_hairDresserID] = customerID;
        BarbershopView.open(hairDresser);
    }

    /**
     * Open a barbershop instance.
     * If a hair dresser instance is not specified, the player will cut the hair themself.
     * Author Note: `If I can cut my own hair, you can too.`
     *
     * @static
     * @param {alt.Player} hairDresser
     * @memberof BarbershopView
     */
    static async open(hairDresser: alt.Player) {
        const hairDresserID = Athena.systems.identifier.getIdByStrategy(hairDresser);
        let customer: alt.Player;

        if (sessions[hairDresserID] === undefined) {
            sessions[hairDresserID] = hairDresserID;
            customer = hairDresser;
        } else {
            customer = Athena.systems.identifier.getPlayer(sessions[hairDresserID]);
        }

        const customerData = Athena.document.character.get(customer);
        if (!customerData.appearance) {
            BarbershopView.close(hairDresser);
            return;
        }

        const isSelfService = sessions[hairDresserID] === hairDresserID;
        const hairDlc = customer.getDlcClothes(2);

        const makeupInfo = customerData.appearance.opacityOverlays.find((x) => x.id === 4);
        const makeupColorInfo = customerData.appearance.colorOverlays.find((x) => x.id === 4);
        const barberData: BarbershopData = {
            sex: customerData.appearance.sex,
            dlc: hairDlc.dlc,
            hair: hairDlc.drawable,
            hairColor1: customerData.appearance.hairColor1,
            hairColor2: customerData.appearance.hairColor2,
            hairOverlay: customerData.appearance.hairOverlay,
            eyeIndex: customerData.appearance.eyebrows,
            eyeColor1: customerData.appearance.eyebrowsColor1,
            eyeOpacity: customerData.appearance.eyebrowsOpacity,
            beardIndex: !customerData.appearance.facialHair ? 0 : customerData.appearance.facialHair,
            beardColor1: customerData.appearance.facialHairColor1,
            beardOpacity: customerData.appearance.facialHairOpacity,
            makeupIndex: makeupInfo && makeupInfo.value ? makeupInfo.value : 0,
            makeupColor1: makeupColorInfo.color1,
            makeupOpacity: makeupInfo && makeupInfo.opacity ? makeupInfo.opacity : 0,
        };

        customer.frozen = true;
        alt.emitClient(hairDresser, BarbershopEvents.ServerClientEvents.OPEN, isSelfService, barberData);
    }

    /**
     * Event to update player hair via another player or self.
     *
     * @static
     * @param {alt.Player} hairDresser
     * @param {BarbershopData} data
     * @return {*}
     * @memberof BarbershopView
     */
    static update(hairDresser: alt.Player, data: BarbershopData) {
        const hairDresserID = Athena.systems.identifier.getIdByStrategy(hairDresser);

        if (sessions[hairDresserID] === undefined) {
            BarbershopView.close(hairDresser);
            return;
        }

        const customer = Athena.systems.identifier.getPlayer(sessions[hairDresserID]);
        if (!customer || !customer.valid) {
            BarbershopView.close(hairDresser);
            return;
        }

        const hairOverlay = hairOverlayInfo[data.hairFullName];
        alt.emitClient(customer, SYSTEM_EVENTS.SET_PLAYER_DECORATIONS, [hairOverlay]);

        if (data.dlc === 0) {
            customer.setClothes(2, data.hair, 0, 0);
        } else {
            customer.setDlcClothes(data.dlc, 2, data.hair, 0, 0);
        }

        customer.setHairColor(data.hairColor1);
        customer.setHairHighlightColor(data.hairColor2);

        // Facial Hair
        customer.setHeadOverlay(1, data.beardIndex, data.beardOpacity);
        customer.setHeadOverlayColor(1, 1, data.beardColor1, data.beardColor1);

        // Eyebrows
        customer.setHeadOverlay(2, data.eyeIndex, data.eyeOpacity);
        customer.setHeadOverlayColor(2, 1, data.eyeColor1, data.eyeColor1);
    }
}
