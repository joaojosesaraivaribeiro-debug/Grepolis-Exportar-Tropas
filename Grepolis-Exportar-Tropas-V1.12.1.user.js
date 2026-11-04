// ==UserScript==
// @name         Grepolis - Exportar Tropas V1.12.1
// @namespace    grepolis-export-troops
// @version      1.12.1
// @description  Exporta tropas das cidades para Excel ou CSV, apenas com o Curador ativo.
// @match        https://*.grepolis.com/game/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

/*
 * PRIVACIDADE
 * Nenhum dado é enviado para servidores externos.
 * Nenhuma biblioteca externa é carregada.
 * Todos os dados são processados localmente.
 *
 * PREMIUM
 * A exportação depende da confirmação do Curador
 * através da API GameDataPremium do próprio jogo.
 */

(function () {
    'use strict';

    const VERSION = '1.12.1';
    const PANEL_ID = 'grepolis-export-panel-v1121';

    // ==================================================
    // NOMES DAS UNIDADES
    // ==================================================

    const UNIT_NAMES = {
        sword: 'Espadachins',
        slinger: 'Fundibulários',
        archer: 'Arqueiros',
        hoplite: 'Hoplitas',
        rider: 'Cavaleiros',
        chariot: 'Carros (Bigas)',
        catapult: 'Catapultas',
        militia: 'Milícias',

        calydonian_boar: 'Javalis da Caledónia',
        centaur: 'Centauros',
        cerberus: 'Cérberos',
        fury: 'Fúrias (Erínias)',
        godsent: 'Enviados divinos',
        griffin: 'Grifos',
        harpy: 'Harpias',
        manticore: 'Mantícoras',
        medusa: 'Medusas',
        minotaur: 'Minotauros',
        pegasus: 'Pégasos',
        zyklop: 'Ciclopes',

        spartan: 'Esparto',
        ladon: 'Ladão',
        siren: 'Sereias',

        bireme: 'Birremes',
        attack_ship: 'Faróis',
        trireme: 'Trirremes',
        sea_monster: 'Hidras',
        demolition_ship: 'Navios incendiários',

        small_transporter: 'Transportes pequenos',
        big_transporter: 'Transportes grandes',
        colonize_ship: 'Colonos'
    };

    // ==================================================
    // CLASSIFICAÇÃO
    // ==================================================

    const LAND_DEFENSE = [
        'archer',
        'sword',
        'calydonian_boar',
        'centaur',
        'cerberus',
        'pegasus'
    ];

    const LAND_ATTACK = [
        'catapult',
        'rider',
        'slinger',
        'fury',
        'griffin',
        'harpy',
        'manticore',
        'spartan',
        'ladon'
    ];

    const LAND_MIXED = [
        'chariot',
        'zyklop',
        'godsent',
        'hoplite',
        'medusa',
        'minotaur'
    ];

    const NAVAL_DEFENSE = ['bireme'];

    const NAVAL_ATTACK = ['attack_ship'];

    const NAVAL_MIXED = [
        'trireme',
        'sea_monster',
        'siren'
    ];

    // ==================================================
    // CORES
    // ==================================================

    const SPECIALTY_COLORS = {
        'Conquista': 'F4CCCC',

        'Defesa Terrestre': 'D9EAD3',
        'Defesa Naval': 'D9EAD3',
        'Defesa Terrestre e Naval': 'B6D7A8',

        'Ataque Terrestre': 'FCE5CD',
        'Ataque Naval': 'FCE5CD',
        'Ataque Terrestre e Naval': 'F9CB9C',

        'Defesa Terrestre / Ataque Naval': 'FFF2CC',
        'Ataque Terrestre / Defesa Naval': 'FFF2CC',

        'Sem especialidade': 'D9D9D9'
    };

    // ==================================================
    // ACESSO AO JOGO
    // ==================================================

    function getGameObject() {
        return window;
    }

    // ==================================================
    // VERIFICAÇÃO PREMIUM
    // ==================================================

    function isCuratorActive() {

        const game = getGameObject();

        try {

            if (
                !game.GameDataPremium ||
                typeof game.GameDataPremium.isAdvisorActivated !== 'function'
            ) {
                return false;
            }

            return game.GameDataPremium.isAdvisorActivated('curator') === true;

        } catch (error) {

            console.warn(
                '[Grepolis Exportar Tropas] Premium check:',
                error
            );

            return false;
        }
    }

    function requireCurator() {

        if (!isCuratorActive()) {

            throw new Error(
                'O Curador não está ativo ou não foi possível confirmar a sua validade.'
            );
        }
    }

    // ==================================================
    // FUNÇÕES AUXILIARES
    // ==================================================

    function toNumber(value) {

        const number = Number(value);

        return Number.isFinite(number) ? number : 0;
    }

    function addUnitObjects(first, second) {

        const result = {};

        [first, second].forEach(object => {

            if (!object || typeof object !== 'object') {
                return;
            }

            Object.entries(object).forEach(([unit, amount]) => {

                result[unit] =
                    (result[unit] || 0) + toNumber(amount);

            });
        });

        return result;
    }

    function getTownName(town) {

        try {

            if (typeof town.getName === 'function') {
                return String(town.getName());
            }

            if (town.name) {
                return String(town.name);
            }

        } catch (error) {

            console.warn('Erro ao obter nome da cidade:', error);
        }

        return 'Cidade desconhecida';
    }

    function getTownUnits(town) {

        let inside = {};
        let outside = {};

        try {

            if (typeof town.units === 'function') {
                inside = town.units() || {};
            }

        } catch (error) {

            console.warn('Erro nas tropas interiores:', error);
        }

        try {

            if (typeof town.unitsOuter === 'function') {
                outside = town.unitsOuter() || {};
            }

        } catch (error) {

            console.warn('Erro nas tropas exteriores:', error);
        }

        return addUnitObjects(inside, outside);
    }

    function getTowns() {

        const game = getGameObject();

        if (!game.ITowns || !game.ITowns.towns) {

            throw new Error(
                'ITowns.towns não está disponível.'
            );
        }

        return Object.values(game.ITowns.towns);
    }

    function countUnits(units, unitIds) {

        return unitIds.reduce(
            (total, unit) => total + toNumber(units[unit]),
            0
        );
    }

    function getUnitName(id) {

        return UNIT_NAMES[id] || id;
    }

    // ==================================================
    // CLASSIFICAÇÃO DOS GRUPOS
    // ==================================================

    function classifyGroup(units, defense, attack, mixed) {

        const totalDefense = countUnits(units, defense);
        const totalAttack = countUnits(units, attack);
        const totalMixed = countUnits(units, mixed);

        if (
            totalDefense === 0 &&
            totalAttack === 0 &&
            totalMixed === 0
        ) {

            return {
                specialty: 'Sem especialidade',
                defense: 0,
                attack: 0
            };
        }

        if (totalAttack > totalDefense) {

            return {
                specialty: 'Ataque',
                attack: totalAttack + totalMixed,
                defense: totalDefense
            };
        }

        if (totalDefense > totalAttack) {

            return {
                specialty: 'Defesa',
                defense: totalDefense + totalMixed,
                attack: totalAttack
            };
        }

        return {
            specialty: 'Sem especialidade',
            defense: totalDefense,
            attack: totalAttack
        };
    }

    // ==================================================
    // CLASSIFICAÇÃO DAS CIDADES
    // ==================================================

    function classifyTown(units) {

        if (toNumber(units.colonize_ship) > 0) {
            return 'Conquista';
        }

        const land = classifyGroup(
            units,
            LAND_DEFENSE,
            LAND_ATTACK,
            LAND_MIXED
        );

        const naval = classifyGroup(
            units,
            NAVAL_DEFENSE,
            NAVAL_ATTACK,
            NAVAL_MIXED
        );

        const hasLand =
            land.specialty !== 'Sem especialidade';

        const hasNaval =
            naval.specialty !== 'Sem especialidade';

        if (!hasLand && !hasNaval) {
            return 'Sem especialidade';
        }

        if (hasLand && !hasNaval) {
            return land.specialty + ' Terrestre';
        }

        if (!hasLand && hasNaval) {
            return naval.specialty + ' Naval';
        }

        if (land.specialty === naval.specialty) {

            return land.specialty + ' Terrestre e Naval';
        }

        return (
            land.specialty +
            ' Terrestre / ' +
            naval.specialty +
            ' Naval'
        );
    }

    // ==================================================
    // RECOLHA DOS DADOS
    // ==================================================

    function collectData() {

        requireCurator();

        const towns = getTowns();

        if (!towns.length) {
            throw new Error('Não foram encontradas cidades.');
        }

        const allUnits = new Set(
            Object.keys(UNIT_NAMES)
        );

        const rows = towns.map(town => {

            const units = getTownUnits(town);

            Object.keys(units).forEach(unit => {
                allUnits.add(unit);
            });

            return {
                town: getTownName(town),
                specialty: classifyTown(units),
                units
            };
        });

        const unitIds = Array.from(allUnits).sort(
            (a, b) =>
                getUnitName(a).localeCompare(getUnitName(b), 'pt')
        );

        return {
            rows,
            unitIds
        };
    }

    // ==================================================
    // DOWNLOAD
    // ==================================================

    function downloadBlob(blob, filename) {

        const url = URL.createObjectURL(blob);

        const link = document.createElement('a');

        link.href = url;
        link.download = filename;

        document.body.appendChild(link);

        link.click();

        link.remove();

        setTimeout(() => {
            URL.revokeObjectURL(url);
        }, 5000);
    }

    // ==================================================
    // EXPORTAÇÃO CSV
    // ==================================================

    function exportCSV(rows, unitIds) {

        const header = [
            'Especialidade',
            'Cidade',
            ...unitIds.map(getUnitName)
        ];

        const csvRows = [header];

        rows.forEach(record => {

            csvRows.push([
                record.specialty,
                record.town,
                ...unitIds.map(unit =>
                    toNumber(record.units[unit])
                )
            ]);
        });

        const totals = unitIds.map(unit =>

            rows.reduce(
                (sum, record) =>
                    sum + toNumber(record.units[unit]),
                0
            )
        );

        csvRows.push([
            'TOTAL DO IMPÉRIO',
            '',
            ...totals
        ]);

        const csv = csvRows.map(row =>

            row.map(value =>

                '"' +
                String(value ?? '').replace(/"/g, '""') +
                '"'

            ).join(';')

        ).join('\r\n');

        const blob = new Blob(
            ['\uFEFF' + csv],
            {
                type: 'text/csv;charset=utf-8;'
            }
        );

        downloadBlob(
            blob,
            'Grepolis_Tropas_V1.12.1.csv'
        );
    }

    // ==================================================
    // EXPORTAÇÃO EXCEL COMPATÍVEL
    // ==================================================

    function escapeHTML(value) {

        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function exportExcel(rows, unitIds) {

        const header = [
            'Especialidade',
            'Cidade',
            ...unitIds.map(getUnitName)
        ];

        const tableRows = [];

        tableRows.push(
            '<tr>' +
            header.map(value =>
                '<th>' + escapeHTML(value) + '</th>'
            ).join('') +
            '</tr>'
        );

        rows.forEach(record => {

            const color =
                SPECIALTY_COLORS[record.specialty] || 'FFFFFF';

            const values = [
                record.specialty,
                record.town,
                ...unitIds.map(unit =>
                    toNumber(record.units[unit])
                )
            ];

            tableRows.push(
                '<tr style="background-color:#' + color + ';">' +
                values.map(value =>
                    '<td>' + escapeHTML(value) + '</td>'
                ).join('') +
                '</tr>'
            );
        });

        const totals = unitIds.map(unit =>

            rows.reduce(
                (sum, record) =>
                    sum + toNumber(record.units[unit]),
                0
            )
        );

        tableRows.push(
            '<tr style="background-color:#FFD966;font-weight:bold;">' +
            ['TOTAL DO IMPÉRIO', '', ...totals]
                .map(value =>
                    '<td>' + escapeHTML(value) + '</td>'
                ).join('') +
            '</tr>'
        );

        const html =
            '<html xmlns:o="urn:schemas-microsoft-com:office:office" ' +
            'xmlns:x="urn:schemas-microsoft-com:office:excel" ' +
            'xmlns="http://www.w3.org/TR/REC-html40">' +

            '<head><meta charset="UTF-8">' +

            '<style>' +
            'table{border-collapse:collapse;font-family:Arial,sans-serif;}' +
            'th{background:#1F4E78;color:white;font-weight:bold;}' +
            'th,td{border:1px solid #999;padding:5px;text-align:center;}' +
            'td:nth-child(2){text-align:left;}' +
            '</style></head><body><table>' +

            tableRows.join('') +

            '</table></body></html>';

        const blob = new Blob(
            ['\uFEFF' + html],
            {
                type: 'application/vnd.ms-excel;charset=utf-8;'
            }
        );

        downloadBlob(
            blob,
            'Grepolis_Tropas_V1.12.1.xls'
        );
    }

    // ==================================================
    // INTERFACE
    // ==================================================

    function setStatus(element, message, error) {

        element.textContent = message;

        element.style.color =
            error ? '#ffb3b3' : '#ffffff';
    }

    function createInterface() {

        if (document.getElementById(PANEL_ID)) {
            return;
        }

        const panel = document.createElement('div');

        panel.id = PANEL_ID;

        panel.style.cssText = [

            'position:fixed',
            'top:600px',
            'right:20px',
            'z-index:2147483647',
            'width:245px',
            'padding:12px',
            'background:#263747',
            'color:white',
            'border:2px solid #b58b45',
            'border-radius:8px',
            'box-shadow:0 3px 12px rgba(0,0,0,.5)',
            'font-family:Arial,sans-serif',
            'font-size:13px',
            'transform:scale(0.7)',
            'transform-origin:top right'

        ].join(';');

        panel.innerHTML = `

            <div style="
                font-size:15px;
                font-weight:bold;
                margin-bottom:10px;
                text-align:center;
            ">
                Exportar Tropas ${VERSION}
            </div>

            <button type="button" id="${PANEL_ID}-excel">
                Exportar Excel
            </button>

            <button type="button" id="${PANEL_ID}-csv">
                Exportar CSV
            </button>

            <div id="${PANEL_ID}-status" style="
                margin-top:10px;
                min-height:30px;
                font-size:12px;
                text-align:center;
            ">
                A verificar o Curador...
            </div>
        `;

        document.body.appendChild(panel);

        panel.querySelectorAll('button').forEach(button => {

            button.style.cssText = [

                'display:block',
                'width:100%',
                'padding:8px',
                'margin-top:6px',
                'border:1px solid #b58b45',
                'border-radius:4px',
                'background:#e8d6ad',
                'color:#222',
                'font-weight:bold',
                'cursor:pointer'

            ].join(';');
        });

        const excelButton = panel.querySelector(
            '#' + PANEL_ID + '-excel'
        );

        const csvButton = panel.querySelector(
            '#' + PANEL_ID + '-csv'
        );

        const status = panel.querySelector(
            '#' + PANEL_ID + '-status'
        );

        function updatePremiumStatus() {

            const active = isCuratorActive();

            excelButton.disabled = !active;
            csvButton.disabled = !active;

            if (active) {

                setStatus(
                    status,
                    'Curador ativo. Pronto.',
                    false
                );

            } else {

                setStatus(
                    status,
                    'Curador inativo ou não verificável.',
                    true
                );
            }

            [excelButton, csvButton].forEach(button => {

                button.style.opacity =
                    button.disabled ? '0.5' : '1';

                button.style.cursor =
                    button.disabled ? 'not-allowed' : 'pointer';
            });
        }

        async function runExport(format) {

            excelButton.disabled = true;
            csvButton.disabled = true;

            setStatus(
                status,
                'A verificar o Curador...',
                false
            );

            try {

                requireCurator();

                setStatus(
                    status,
                    'A recolher tropas...',
                    false
                );

                const result = collectData();

                setStatus(
                    status,
                    result.rows.length +
                    ' cidades encontradas. A preparar ficheiro...',
                    false
                );

                requireCurator();

                if (format === 'excel') {

                    exportExcel(
                        result.rows,
                        result.unitIds
                    );

                } else {

                    exportCSV(
                        result.rows,
                        result.unitIds
                    );
                }

                setStatus(
                    status,
                    'Exportação concluída!',
                    false
                );

            } catch (error) {

                console.error(
                    '[Grepolis Exportar Tropas]',
                    error
                );

                setStatus(
                    status,
                    'Erro: ' + error.message,
                    true
                );

            } finally {

                updatePremiumStatus();
            }
        }

        excelButton.addEventListener(
            'click',
            () => runExport('excel')
        );

        csvButton.addEventListener(
            'click',
            () => runExport('csv')
        );

        updatePremiumStatus();

        setInterval(
            updatePremiumStatus,
            30000
        );
    }

    // ==================================================
    // INITIALIZATION - CORRECTION V1.12.1
    // ==================================================

    function ensureInterface() {

        if (!document.body) {
            return false;
        }

        try {

            if (!document.getElementById(PANEL_ID)) {

                createInterface();

                console.log(
                    '[Grepolis Exportar Tropas] Interface V' +
                    VERSION +
                    ' criada.'
                );
            }

            return !!document.getElementById(PANEL_ID);

        } catch (error) {

            console.error(
                '[Grepolis Exportar Tropas] Interface initialization failed:',
                error
            );

            return false;
        }
    }

    function initialize() {

        ensureInterface();

        // Surveillance des modifications du DOM de Grepolis.
        const observer = new MutationObserver(() => {

            if (!document.getElementById(PANEL_ID)) {
                ensureInterface();
            }

        });

        const startObserver = () => {

            if (document.documentElement) {

                observer.observe(document.documentElement, {
                    childList: true,
                    subtree: true
                });

            } else {

                setTimeout(startObserver, 250);
            }
        };

        startObserver();

        // Vérification de secours toutes les 3 secondes.
        setInterval(
            ensureInterface,
            3000
        );

        console.log(
            '[Grepolis Exportar Tropas] V' +
            VERSION +
            ' iniciado.'
        );
    }

    initialize();

})();