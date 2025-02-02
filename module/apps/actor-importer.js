/* global Actor, CONFIG, duplicate, Folder, game, ui */
import { CoC7ActorImporterRegExp } from './actor-importer-regexp.js'
import { CoCActor } from '../actors/actor.js'
import { CoC7Item } from '../items/item.js'

/**
 * CoC7ActorImporter helper class to import an Actor from the raw text description.
 */
export class CoC7ActorImporter {
  constructor () {
    this.parsed = {}
    this.itemLocations = ''
  }

  static get asNumber () {
    return 'n'
  }

  static get asString () {
    return 's'
  }

  /**
   * getRegEx, get RegExp object if not currently a RegExp object
   * @param {Mixed} regex RegExp or string
   * @param {String} modifiers if string was supplied in regex list of modifiers to add to the RegExp
   * @returns {RegExp}
   */
  getRegEx (regex, modifiers = 'iu') {
    if (regex.constructor?.name === 'RegExp') {
      return regex
    }
    return new RegExp(regex, modifiers)
  }

  /**
   * cleanString, removes new line and carrier return character and lateral spaces from a string
   * @param {String} s the string to clean
   * @returns {String} the cleaned string
   */
  cleanString (s) {
    return s
      .replace(/(\n|\r)/g, ' ')
      .replace(/^\s*/, '')
      .replace(/\s*\.?\s*\.?$/, '')
  }

  /**
   * translateRoll, translates language specific shortform of dice (D) in rolls
   * Example for German rolls: 1W4 => 1D4.
   * Dice shortform is configured using keys.diceShort
   * @param {String} s the roll to be translated
   * @returns {String} the translated roll
   */
  translateRoll (s) {
    if (typeof s === 'undefined') return s
    if (typeof this.keys.diceShort !== 'undefined') {
      const regEx = new RegExp(
        '(?<n1>\\d+)' + this.keys.diceShort + '(?<n2>\\d+)',
        'iug'
      )
      return s.replace(regEx, '$<n1>D$<n2>')
    } else {
      return s
    }
  }

  /**
   * toHTML, converts a string to HTML striping out empty lines or lines that contain just , or .
   * @param {String} s the string to convert
   * @returns {String} the HTML or an empty string
   */
  toHTML (s) {
    if (s.trim().length === 0) {
      return ''
    }
    s = s
      .trim()
      .split('\n')
      .map(text => text.trim().replace(/^[,.\s]+$/, ''))
      .filter(text => text)
      .join('</p><p>')
    if (s.length === 0) {
      return ''
    }
    return '<p>' + s + '</p>'
  }

  /**
   * check expects a key from this.regEx will attempt to match the text
   * @param {String} regExKey key in this.regEx
   * @param {JSON}
   * - removeFromText remove from this.text
   * - saveKeys add group keys to this.parsed
   * - type If adding with saveKeys set type (CoC7ActorImporter.asString / CoC7ActorImporter.asNumber)
   * - text If set use this instead of this.text
   * - requiredGroup If not false require specified key in RegExp groups
   * @returns {False}/{JSON groups '' is matched string}
   */
  check (
    regExKey,
    {
      removeFromText = true,
      saveKeys = true,
      type = CoC7ActorImporter.asString,
      text = false,
      requiredGroup = false
    } = {}
  ) {
    let output = false
    let regExp = false
    if (typeof this.regEx[regExKey] !== 'undefined') {
      regExp = this.getRegEx(this.regEx[regExKey])
    } else if (typeof this.keys[regExKey] !== 'undefined') {
      regExp = this.getRegEx(this.keys[regExKey])
    }
    if (regExp !== false) {
      if (text === false) {
        text = this.text
      }
      const check = regExp.exec(text)
      let value = null
      if (
        check !== null &&
        (requiredGroup === false ||
          typeof (check.groups || {})[requiredGroup] !== 'undefined')
      ) {
        output = check.groups || {}
        if (removeFromText) {
          this.text = this.text.replace(check[0].trim(), '\n').trim()
        }
        if (saveKeys) {
          for (const key of Object.keys(check.groups)) {
            switch (type) {
              case CoC7ActorImporter.asString:
                this.parsed[key] = String(check.groups[key]).replace('\n', ' ')
                break
              case CoC7ActorImporter.asNumber:
                value = Number(check.groups[key])
                if (!isNaN(value)) {
                  this.parsed[key] = Number(check.groups[key])
                }
                break
            }
          }
        }
        output['-source'] = check[0]
        output['-index'] = check.index
      }
    }
    return output
  }

  /**
   * processCombat extracts combat / dodge information from a subsection of text
   * @param {String} text the raw text of the combat section
   * @returns void
   */
  processCombat (text) {
    if (text.trim().length === 0) {
      return
    }
    if (CONFIG.debug.CoC7Importer) {
      console.log('combat text', text)
    }
    let weapon
    let dodge
    let newline
    let lastPercent = false
    let maxLoops = 40
    do {
      maxLoops--
      text = text.trim()
      if (
        (dodge = this.check('weaponDodge', { saveKeys: false, text: text }))
      ) {
        text = text.replace(dodge['-source'], '\n')
        if (typeof this.parsed.skills === 'undefined') {
          this.parsed.skills = []
        }
        this.parsed.skills.push({
          name: this.cleanString(dodge.name),
          value: Number(dodge.percentage),
          push: false
        })
      } else if (
        (weapon = this.check('weapon', {
          saveKeys: false,
          text: text,
          requiredGroup: lastPercent === false ? 'percentage' : false
        }))
      ) {
        text = text.replace(weapon['-source'], '\n')
        const name = this.cleanString(weapon.name || '')
        let damage = this.translateRoll(this.cleanString(weapon.damage || ''))
        const isRanged = !!(
          this.check('handgun', {
            text: name,
            removeFromText: false,
            saveKeys: false
          }) ||
          this.check('rifle', {
            text: name,
            removeFromText: false,
            saveKeys: false
          }) ||
          this.check('smb', {
            text: name,
            removeFromText: false,
            saveKeys: false
          }) ||
          this.check('machineGun', {
            text: name,
            removeFromText: false,
            saveKeys: false
          }) ||
          this.check('launched', {
            text: name,
            removeFromText: false,
            saveKeys: false
          })
        )
        if (
          weapon.percentage !== null &&
          typeof weapon.percentage !== 'undefined'
        ) {
          lastPercent = Number(weapon.percentage)
        } else {
          lastPercent = true
        }
        let found
        let ahdb = false
        let addb = false
        do {
          found = this.getRegEx(
            '\\s*[+-]?\\s*(' +
              this.keys.halfdb +
              ')\\s*(' +
              this.keys.fulldb +
              ')?[-+]?\\s*(' +
              this.parsed.db.replace(/^[-+]/, '') +
              ')?'
          ).exec(damage)
          if (found) {
            ahdb = true
            damage = damage.replace(found[0], '')
          } else {
            found = this.getRegEx(
              '\\s*[+-]?\\s*(' +
                this.keys.fulldb +
                ')\\s*[-+]?\\s*(' +
                this.parsed.db.replace(/^[-+]/, '') +
                ')?'
            ).exec(damage)
            if (found) {
              addb = true
              damage = damage.replace(found[0], '')
            }
          }
        } while (found)
        const damages = damage.split('/')
        const isShotgun = damages.length === 3
        const data = {
          name: name,
          type: 'weapon',
          data: {
            skill: {
              id: lastPercent
            },
            properties: {},
            range: {
              normal: {
                value: isShotgun ? 10 : 0,
                damage: damages[0]
              },
              long: {
                value: isShotgun ? 20 : 0,
                damage: isShotgun ? damages[1] : ''
              },
              extreme: {
                value: isShotgun ? 50 : 0,
                damage: isShotgun ? damages[2] : ''
              }
            }
          }
        }
        // Set some of the properties
        data.data.properties.shotgun = isShotgun
        data.data.properties.rngd = isRanged || isShotgun
        data.data.properties.melee = !data.data.properties.rngd
        data.data.properties.ahdb = ahdb
        data.data.properties.addb = addb
        if (typeof this.parsed.attacks === 'undefined') {
          this.parsed.attacks = []
        }
        this.parsed.attacks.push(data)
      } else if ((newline = text.match(/^(.+)\n/))) {
        text = text.replace(newline[0], '\n')
      } else if ((newline = text.match(/^[^\n]+$/))) {
        text = ''
      }
    } while (maxLoops > 0 && (!!weapon || !!dodge || !!text))
    if (maxLoops === 0) {
      ui.notifications.warn(
        'Unexpected weapons text, please raise a bug report with the text you are attempting to import'
      )
      console.debug('Unexpected weapons:', text)
    }
  }

  /**
   * processSkills extracts skills / language information from a subsection of text
   * @param {String} text the raw text of the skills / language section
   * @returns void
   */
  processSkills (text, key = 'skills') {
    if (text.trim().length === 0) {
      return
    }
    const breaks = text.split(/\.\r?\n/)
    if (breaks.length > 1) {
      text = breaks[0]
    }
    let skill
    let maxLoops = 40
    do {
      maxLoops--
      text = text.trim()
      skill = this.check('skill', { saveKeys: false, text: text })
      if (skill) {
        text = text.replace(skill['-source'], '\n')
        if (typeof this.parsed[key] === 'undefined') {
          this.parsed[key] = []
        }
        this.parsed[key].push({
          name: this.cleanString(skill.name),
          value: Number(skill.percentage)
        })
      }
    } while (maxLoops > 0 && skill)
    if (maxLoops === 0) {
      ui.notifications.warn(
        'Unexpected skills text, please raise a bug report with the text you are attempting to import'
      )
      console.debug('Unexpected skills:', text)
    }
  }

  /**
   * processSpells extracts spell information from a subsection of text
   * @param {String} text the raw text of the spell section
   * @returns void
   */
  processSpells (text) {
    if (text.trim().length === 0) {
      return
    }
    const breaks = text.split(/\.\r?\n/)
    if (breaks.length > 1) {
      text = breaks[0]
    }
    const spellsArr = text.replace(/([\n\r]+)/g, ' ').split(/(?<!\([^)]+),/)
    this.text = this.text.replace(text.trim(), '\n')
    for (const spell of spellsArr) {
      if (typeof this.parsed.spells === 'undefined') {
        this.parsed.spells = []
      }
      this.parsed.spells.push(this.cleanString(spell))
    }
  }

  /**
   * parseCharacter extracts information from the raw text description of an entity (NPC or Creature)
   * @param {String} text the raw text of the entity
   * @returns extractedData object with the entity data
   */
  async parseCharacter (text) {
    // Replace "En Dash" and "Em Dash" dashes with - and "Right Single Quotation Mark" with '
    this.text = String(text)
      .trim()
      .replace(/\u2013|\u2014|\u2212/g, '-')
      .replace(/\u2019/g, "'")
      .replace(/[\udbc0-\udbfe][\udc00-\udfff]/g, '')
    // Earliest character that has been used, to work out the header
    let min = this.text.length
    // STR, if berfore than previous min update it
    let check = this.check('str', { type: CoC7ActorImporter.asNumber })[
      '-index'
    ]
    if (!isNaN(check)) {
      min = Math.min(min, check)
    }
    // CON, if berfore than previous min update it
    check = this.check('con', { type: CoC7ActorImporter.asNumber })['-index']
    if (!isNaN(check)) {
      min = Math.min(min, check)
    }
    // SIZ, if berfore than previous min update it
    check = this.check('siz', { type: CoC7ActorImporter.asNumber })['-index']
    if (!isNaN(check)) {
      min = Math.min(min, check)
    }
    // INT, if berfore than previous min update it
    check = this.check('int', { type: CoC7ActorImporter.asNumber })['-index']
    if (!isNaN(check)) {
      min = Math.min(min, check)
    }
    // POW, if berfore than previous min update it
    check = this.check('pow', { type: CoC7ActorImporter.asNumber })['-index']
    if (!isNaN(check)) {
      min = Math.min(min, check)
    }
    // DEX, if berfore than previous min update it
    check = this.check('dex', { type: CoC7ActorImporter.asNumber })['-index']
    if (!isNaN(check)) {
      min = Math.min(min, check)
    }
    // APP, if berfore than previous min update it
    check = this.check('app', { type: CoC7ActorImporter.asNumber })['-index']
    if (!isNaN(check)) {
      min = Math.min(min, check)
    }
    // EDU, if berfore than previous min update it
    check = this.check('edu', { type: CoC7ActorImporter.asNumber })['-index']
    if (!isNaN(check)) {
      min = Math.min(min, check)
    }
    // SAN, if berfore than previous min update it
    check = this.check('san', { type: CoC7ActorImporter.asNumber })['-index']
    if (!isNaN(check)) {
      min = Math.min(min, check)
    }
    // HP, if berfore than previous min update it
    check = this.check('hp', { type: CoC7ActorImporter.asNumber })['-index']
    if (!isNaN(check)) {
      min = Math.min(min, check)
    }
    // MP, if berfore than previous min update it
    check = this.check('mp', { type: CoC7ActorImporter.asNumber })['-index']
    if (!isNaN(check)) {
      min = Math.min(min, check)
    }
    // Work out the header based on previous minimum matched character
    let header
    if (min > 0) {
      header = this.text.substr(0, min)
      // Get name from header
      check = this.check('name', { text: header })
      if (check === false) {
        // If not found use default NPC name
        this.parsed.name = game.i18n.localize('CoC7.ImportedUnnamedCharacter')
      } else {
        // Remove name from header
        header = header.replace(check['-source'], '\n')
      }
      // Get age from header
      check = this.check('age', { text: header })
      if (check !== false) {
        // If found remove age from header
        header = header.replace(check['-source'], '\n')
      }
      // Get occupation from header
      if (!this.check('occupation', { text: header }) && header.trim() !== '') {
        // If occupation is not found but there is a header set the occupation to the remaining header
        let occupation = header
        if (header.indexOf('.') > -1) {
          // If there is a full stop just use the first part of the header as the occupation
          occupation = header.substr(0, header.indexOf('.') + 1)
        }
        this.parsed.occupation = occupation
          .replace(/([\n\r]+)/g, ' ')
          .trim()
          .replace(/,$/, '')
        this.text = this.text.replace(occupation.trim(), '\n')
      }
    } else {
      // There is no header set default NPC name
      this.parsed.name = game.i18n.localize('CoC7.ImportedUnnamedCharacter')
    }
    // If there is an occupation but no age check if the occupation starts number split age and occupation
    if (
      typeof this.parsed.occupation !== 'undefined' &&
      typeof this.parsed.age === 'undefined'
    ) {
      const occupationAge = this.parsed.occupation.match(
        /^(?<age>\d+),(?<occupation>.+)$/
      )
      if (occupationAge) {
        this.parsed.age = occupationAge.groups.age
        this.parsed.occupation = occupationAge.groups.occupation.trim()
      }
    }
    // Get damage bonus, if not found or none set to 0
    if (
      !this.check('db') ||
      this.check('dbNone', {
        removeFromText: false,
        saveKeys: false,
        text: this.parsed.db
      })
    ) {
      this.parsed.db = '0'
    }
    this.parsed.db = this.translateRoll(this.parsed.db)
    // Get build
    this.check('build')
    // Get armor, if not found or none set to 0
    if (
      !this.check('armor') ||
      this.check('armorNone', {
        removeFromText: false,
        saveKeys: false,
        text: this.parsed.armor
      })
    ) {
      this.parsed.armor = '0'
    }
    // Get movement
    this.check('mov', { type: CoC7ActorImporter.asNumber })
    // Get luck
    this.check('lck', { type: CoC7ActorImporter.asNumber })
    // Get sanity loss
    this.check('sanLoss')
    this.parsed.sanLoss = this.translateRoll(this.parsed.sanLoss)
    // Get attacks per round, if not found or none set to 0
    if (
      this.check('attacksPerRound') &&
      this.check('attacksPerRoundNone', {
        removeFromText: false,
        saveKeys: false,
        text: this.parsed.attacksPerRound
      })
    ) {
      this.parsed.attacksPerRound = '0'
    }
    // Check if there is a combat section
    this.text = '\n' + this.text
    let sections = this.getRegEx('(' + this.keys.sectionCombats + ')', 'i')
    if (this.text.match(sections) === null) {
      // If there is no combat section guess where it starts
      sections = this.check('guessStartCombat', {
        saveKeys: false,
        removeFromText: false
      })
      if (sections) {
        // Add a header to the start of the combat section
        this.text = [
          this.text.slice(0, sections['-index']),
          this.keys.newCombatHeader,
          this.text.slice(sections['-index'])
        ].join('')
      }
    }
    // Split the sections Combat, Skills, Languages, and Spells
    const regExpSections = this.getRegEx(this.regEx.sections, 'i')
    sections = this.text.split(regExpSections)
    if (sections !== null) {
      for (let i = 0, im = sections.length; i < im; i++) {
        if (
          sections[i].match(
            this.getRegEx('(' + this.keys.sectionCombats + ')', 'i')
          ) !== null &&
          typeof sections[i + 1] !== 'undefined'
        ) {
          // If section is combat
          this.text = ('\n' + this.text + '\n')
            .replace(sections[i], '\n')
            .trim()
          this.processCombat(sections[i + 1])
          i++
        } else if (
          sections[i].match(
            this.getRegEx('(' + this.keys.sectionSkills + ')', 'i')
          ) !== null &&
          typeof sections[i + 1] !== 'undefined'
        ) {
          // If section is skills
          this.text = ('\n' + this.text + '\n')
            .replace(sections[i], '\n')
            .trim()
          this.processSkills(sections[i + 1])
          i++
        } else if (
          sections[i].match(
            this.getRegEx('(' + this.keys.sectionLangauges + ')', 'i')
          ) !== null &&
          typeof sections[i + 1] !== 'undefined'
        ) {
          // If section is languages
          this.text = ('\n' + this.text + '\n')
            .replace(sections[i], '\n')
            .trim()
          this.processSkills(sections[i + 1], 'languages')
          i++
        } else if (
          sections[i].match(
            this.getRegEx('(' + this.keys.sectionSpells + ')', 'i')
          ) !== null &&
          typeof sections[i + 1] !== 'undefined'
        ) {
          // If section is spells
          this.text = ('\n' + this.text + '\n')
            .replace(sections[i], '\n')
            .trim()
          this.processSpells(sections[i + 1])
          i++
        }
      }
    }
    // Any remaining text add to GM notes so you can easily see if there are any obvious issue or just general notes
    this.parsed.gmnotes = this.toHTML(this.text)
    return this.parsed
  }

  disableAttribAuto (key, attribValue, check, updateData) {
    const value = Math.max(0, Number(attribValue))
    if (value !== Number(check)) {
      updateData[`data.attribs.${key}.auto`] = false
      updateData[`data.attribs.${key}.value`] = value
      if (key === 'build') {
        updateData[`data.attribs.${key}.current`] = value
      } else {
        updateData[`data.attribs.${key}.max`] = value
      }
    }
    return updateData
  }

  /**
   * Create an entity (`npc` or `creature`) from the object with the already parsed entity data
   * @param {Object} characterData object with the data extracted from the character
   * @param {String} entityTypeString entity type obtained from the user input
   * @returns {Actor} the created foundry `Actor`
   */
  async createEntity (characterData, entityType) {
    const importedCharactersFolder =
      await this.createImportCharactersFolderIfNotExists()
    if (entityType !== 'npc') {
      entityType = 'creature'
    }
    const actorData = {
      name: characterData.name,
      type: entityType,
      folder: importedCharactersFolder.id,
      data: characterData.actor
    }
    const npc = await Actor.create(actorData)
    await npc.createEmbeddedDocuments('Item', characterData.items, {
      renderSheet: false
    })
    const updateData = {}
    let value = 0
    if (typeof characterData.actor.attribs.hp?.value !== 'undefined') {
      this.disableAttribAuto(
        'hp',
        characterData.actor.attribs.hp.value,
        npc.hpMax,
        updateData
      )
    }
    if (typeof characterData.actor.attribs.mp?.value !== 'undefined') {
      this.disableAttribAuto(
        'mp',
        characterData.actor.attribs.mp.value,
        npc.mpMax,
        updateData
      )
    }
    if (typeof characterData.actor.attribs.mov?.value !== 'undefined') {
      this.disableAttribAuto(
        'mov',
        characterData.actor.attribs.mov.value,
        npc.mov,
        updateData
      )
    }
    if (typeof characterData.actor.attribs.build?.value !== 'undefined') {
      this.disableAttribAuto(
        'build',
        characterData.actor.attribs.build.value,
        npc.build,
        updateData
      )
    }
    if (typeof characterData.actor.attribs.db?.value !== 'undefined') {
      value = String(characterData.actor.attribs.db.value).replace(/^\+\s*/, '')
      if (value !== String(npc.db)) {
        updateData['data.attribs.db.auto'] = false
        updateData['data.attribs.db.value'] = value
      }
    }
    if (Object.keys(updateData).length > 0) {
      if (CONFIG.debug.CoC7Importer) {
        console.debug('updateData:', updateData)
      }
      await npc.update(updateData)
    }
    const updateItemData = []
    let lastWeaponSkill = null
    for (const pair of this.weaponSkills) {
      if (pair[0] !== false) {
        lastWeaponSkill = npc.items.filter(
          i =>
            i.name === pair[0].name &&
            i.type === 'skill' &&
            Number(i.data.data.value) === Number(pair[0].data.value)
        )
      }
      const weapon = npc.items.filter(
        i =>
          i.name === pair[1].name &&
          i.type === 'weapon' &&
          i.data.data.range.normal.damage === pair[1].data.range.normal.damage
      )
      if (lastWeaponSkill[0] && weapon[0]) {
        updateItemData.push({
          _id: weapon[0].id,
          'data.skill.main.id': lastWeaponSkill[0].id,
          'data.skill.main.name': lastWeaponSkill[0].name
        })
      }
    }
    if (updateItemData.length > 0) {
      if (CONFIG.debug.CoC7Importer) {
        console.debug('updateItemData:', updateItemData)
      }
      await npc.updateEmbeddedDocuments('Item', updateItemData)
    }
    return npc
  }

  /**
   * Creates a folder on the actors tab called "Imported Characters" if the folder doesn't exist.
   * @returns {Folder} the importedCharactersFolder
   */
  async createImportCharactersFolderIfNotExists () {
    let folderName = game.i18n.localize('CoC7.ImportedCharactersFolder')
    if (folderName === 'CoC7.ImportedCharactersFolder') {
      folderName = 'Imported characters'
    }
    let importedCharactersFolder = game.folders.find(
      entry => entry.data.name === folderName && entry.data.type === 'Actor'
    )
    if (
      importedCharactersFolder === null ||
      typeof importedCharactersFolder === 'undefined'
    ) {
      // Create the folder
      importedCharactersFolder = await Folder.create({
        name: folderName,
        type: 'Actor',
        parent: null
      })
      ui.notifications.info(
        game.i18n.localize('CoC7.CreatedImportedCharactersFolder')
      )
    }
    return importedCharactersFolder
  }

  /**
   * actorData, convert parseCharacter data into Actor data
   * @param {Object} pc object with the data extracted from the character as returned from `parseCharacter`
   * @returns {Object} formatted Actor data
   */
  actorData (pc) {
    const data = {
      characteristics: {},
      attribs: {},
      infos: {},
      special: {},
      description: {
        keeper: ''
      },
      flags: {
        locked: false,
        displayFormula: false
      }
    }
    for (const key of [
      'str',
      'con',
      'siz',
      'dex',
      'app',
      'int',
      'pow',
      'edu'
    ]) {
      if (typeof pc[key] !== 'undefined') {
        data.characteristics[key] = {
          value: Number(pc[key])
        }
      }
    }
    for (const key of ['san', 'mov', 'build', 'armor', 'lck', 'hp', 'mp']) {
      if (typeof pc[key] !== 'undefined') {
        data.attribs[key] = {
          value: Number(pc[key])
        }
      }
    }
    if (typeof pc.db !== 'undefined') {
      data.attribs.db = {
        value: pc.db
      }
    }
    for (const key of ['age', 'occupation']) {
      if (typeof pc[key] !== 'undefined') {
        data.infos[key] = pc[key]
      }
    }
    if (typeof pc.sanLoss !== 'undefined') {
      const [passed, failed] = pc.sanLoss.split('/')
      data.special.sanLoss = {
        checkPassed: passed,
        checkFailled: failed
      }
    }
    if (typeof pc.attacksPerRound !== 'undefined') {
      data.special.attacksPerRound = Number(pc.attacksPerRound)
    }
    data.description.keeper = pc.gmnotes
    if (CONFIG.debug.CoC7Importer) {
      console.debug('actorData:', data)
    }
    return data
  }

  /**
   * guessItem, try and find the item in the locations defined in this.itemLocations i = Item Directory, w = World Compendiums, m = Module Compendiums, s = System Compendiums
   * @param {String} type Item type to find
   * @param {String} name Name of item to find
   * @param {Object} combat null (default). If boolean combat property of skill must match
   * @returns {Object} formatted Actor data Item or null
   */
  async guessItem (type, name, { combat = null } = {}) {
    name = name.toLowerCase()
    let existing = null
    for (let o = 0, oM = this.itemLocations.length; o < oM; o++) {
      switch (this.itemLocations.substr(o, 1)) {
        case 'i':
          existing = game.items.find(
            item =>
              item.data.type === type &&
              item.data.name.toLowerCase() === name &&
              (combat === null || item.data.properties.combat === combat)
          )
          if (existing) {
            return existing
          }
          break
        case 'w':
        case 'm':
        case 's':
          for (const pack of game.packs) {
            if (
              pack.metadata.entity === 'Item' &&
              ((this.itemLocations[o] === 'w' &&
                pack.metadata.package === 'world') ||
                (this.itemLocations[o] === 'S' &&
                  pack.metadata.package === 'CoC7') ||
                (this.itemLocations[o] === 's' &&
                  !['world', 'CoC7'].includes(pack.metadata.package)))
            ) {
              const documents = await pack.getDocuments()
              existing = documents.find(
                item =>
                  item.data.type === type &&
                  item.data.name.toLowerCase() === name &&
                  (combat === null || item.data.properties.combat === combat)
              )
              if (existing) {
                return existing
              }
            }
          }
          break
      }
    }
  }

  /**
   * itemsData, convert parseCharacter data into Actor item data
   * @param {Object} pc object with the data extracted from the character as returned from `parseCharacter`
   * @returns {Object} formatted Actor data
   */
  async itemsData (pc) {
    const items = []
    this.weaponSkills = []
    // Weapon skills
    if (typeof pc.attacks !== 'undefined') {
      for (const attack of pc.attacks) {
        let skill = false
        if (attack.data?.skill?.id !== true) {
          skill = await this.weaponSkill(attack)
          items.push(skill)
        }
        attack.data.skill.id = null
        items.push(attack)
        this.weaponSkills.push([skill, attack])
      }
    }
    // Skills
    if (typeof pc.skills !== 'undefined') {
      for (const skill of pc.skills) {
        const existing = await this.guessItem('skill', skill.name)
        if (typeof existing !== 'undefined') {
          const cloned = existing.toObject()
          cloned.data.base = skill.value
          if (typeof skill.push !== 'undefined') {
            cloned.data.properties.push = skill.push
          }
          items.push(duplicate(cloned))
        } else {
          const options = {}
          if (typeof skill.push !== 'undefined') {
            options.push = skill.push
          }
          items.push(CoCActor.emptySkill(skill.name, skill.value, options))
        }
      }
    }
    // Languages
    if (typeof pc.languages !== 'undefined') {
      for (const skill of pc.languages) {
        const existing = await this.guessItem('skill', skill.name)
        if (typeof existing !== 'undefined') {
          const cloned = existing.toObject()
          cloned.data.base = skill.value
          items.push(duplicate(cloned))
        } else {
          items.push(
            CoCActor.emptySkill(skill.name, skill.value, {
              img: CoC7Item.iconLanguage,
              specialization: 'Language'
            })
          )
        }
      }
    }
    // Spells
    if (typeof pc.spells !== 'undefined') {
      for (const name of pc.spells) {
        const existing = await this.guessItem('spell', name)
        if (typeof existing !== 'undefined') {
          const cloned = existing.toObject()
          items.push(duplicate(cloned))
        } else {
          items.push(CoCActor.emptySpell(name))
        }
      }
    }
    return items
  }

  /**
   * basicWeaponData creates a basic object with the default basic data for a weapon skill
   * @param {boolean} firearms true if the weapon uses firearms, false if it's a melee one.
   * @returns object with default values for the weapon
   */
  basicWeaponSkillData (firearms) {
    return {
      specialization: game.i18n.localize(
        firearms
          ? 'CoC7.FirearmSpecializationName'
          : 'CoC7.FightingSpecializationName'
      ),
      properties: {
        special: true,
        fighting: !firearms,
        firearm: firearms,
        combat: true
      }
    }
  }

  /** weaponSkill tries to guess what kind of weapon skill to use for weapon from it's name
   * @param weapon: JSON, weapon data
   */
  async weaponSkill (weapon) {
    let skill = null
    if (this.getRegEx('handgun').exec(weapon.name)) {
      skill = await this.guessItem('skill', 'Handgun', { combat: true })
      if (CONFIG.debug.CoC7Importer) {
        console.debug(`${weapon.name} uses Handgun skill: ${skill}`)
      }
    } else if (this.getRegEx('rifle').exec(weapon.name)) {
      skill = await this.guessItem('skill', 'Rifle/Shotgun', { combat: true })
      if (!skill) {
        skill = await this.guessItem('skill', 'Rifle', { combat: true })
        if (!skill) {
          skill = await this.guessItem('skill', 'Shotgun', { combat: true })
        }
      }
      if (CONFIG.debug.CoC7Importer) {
        console.debug(`${weapon.name} uses Rifle skill: ${skill}`)
      }
    } else if (this.getRegEx('smb').exec(weapon.name)) {
      skill = await this.guessItem('skill', 'Submachine Gun', { combat: true })
      if (CONFIG.debug.CoC7Importer) {
        console.debug(`${weapon.name} uses Submachine Gun skill: ${skill}`)
      }
    } else if (this.getRegEx('machineGun').exec(weapon.name)) {
      skill = await this.guessItem('skill', 'Machine Gun', { combat: true })
      if (CONFIG.debug.CoC7Importer) {
        console.debug(`${weapon.name} uses Machine Gun skill: ${skill}`)
      }
    } else if (this.getRegEx('launched').exec(weapon.name)) {
      skill = await this.guessItem('skill', 'Launch', { combat: true })
      if (CONFIG.debug.CoC7Importer) {
        console.debug(`${weapon.name} uses Launch skill: ${skill}`)
      }
    }
    if (skill !== null && typeof skill !== 'undefined') {
      const skillClone = skill.clone({
        data: {
          value: weapon.data?.skill?.id
        }
      })
      return skillClone
    }
    const newSkill = {
      name: weapon.name,
      type: 'skill',
      data: this.basicWeaponSkillData(weapon.data?.properties?.rngd)
    }
    newSkill.data.base = weapon.data?.skill?.id
    newSkill.data.value = weapon.data?.skill?.id
    if (CONFIG.debug.CoC7Importer) {
      console.debug(
        `Weapon skill not found for ${weapon.name}, creating a new one`,
        newSkill
      )
    }
    return newSkill
  }

  /**
   * needsConversion does an evaluation to see if the given npc needs to be converted to 7th Edition
   * Returns `false` when any of the Characteristics value it's above 29
   */
  needsConversion (npc) {
    let needsConversionResult = true
    for (const key of [
      'str',
      'con',
      'siz',
      'dex',
      'app',
      'int',
      'pow',
      'edu'
    ]) {
      if (typeof npc[key] !== 'undefined' && npc[key] > 30) {
        needsConversionResult = false
      }
    }
    if (CONFIG.debug.CoC7Importer) {
      console.debug('needsConversion:', needsConversionResult)
    }
    return needsConversionResult
  }

  /**
   * createActor main method to create an `Actor` from a give user input, takes on account the lang, entity type,
   * the convert to 7 Edition flag, and the raw entity data.
   * @param {Object} inputs inputs from the form to create an Actor
   * @returns {Actor} the foundry `Actor` from the given `input` options
   */
  async createActor (inputs) {
    if (CONFIG.debug.CoC7Importer) {
      console.debug('createActor:', inputs)
    }
    const lang = CoC7ActorImporterRegExp.checkLanguage(inputs.lang)
    this.keys = CoC7ActorImporterRegExp.getKeys(lang)
    this.regEx = CoC7ActorImporterRegExp.getRegularExpressions(lang)
    this.itemLocations = inputs.source
    if (CONFIG.debug.CoC7Importer) {
      console.debug('Regular Expressions:', lang, this.keys, this.regEx)
    }
    let character = await this.parseCharacter(inputs.text)
    if (CONFIG.debug.CoC7Importer) {
      console.debug('parseCharacter:', character)
    }
    if (
      (inputs.convertFrom6E === 'coc-guess' &&
        this.needsConversion(character)) ||
      inputs.convertFrom6E === 'coc-convert'
    ) {
      character = await this.convert7E(character)
    }
    const characterData = {
      name: character.name,
      actor: this.actorData(character),
      items: await this.itemsData(character)
    }

    if (typeof inputs.testMode !== 'undefined' && inputs.testMode === true) {
      return characterData
    }
    const npc = await this.createEntity(characterData, inputs.entity)
    return npc
  }

  /**
   * convert7E Converts the given entity from 6 edition to 7 edition
   * @param {Object} the entity object as obtained from `parseCharacter`
   * @return the same object but with updated characteristics for 7 edition
   */
  async convert7E (creature) {
    if (CONFIG.debug.CoC7Importer) {
      console.debug('Converting npc', creature)
    }
    for (const key of ['str', 'con', 'siz', 'dex', 'app', 'int', 'pow']) {
      if (typeof creature[key] !== 'undefined') {
        creature[key] *= 5
      }
    }
    if (typeof creature.edu !== 'undefined') {
      if (creature.edu <= 18) {
        creature.edu *= 5
      } else if (creature.edu <= 26) {
        creature.edu = creature.edu + 90 - 18
      } else {
        // creature.edu >=28
        creature.edu = 99
      }
    }
    if (typeof creature.db !== 'undefined') {
      if (creature.db === '-1d4') {
        creature.db = -1
      } else if (creature.db === '-1d6') {
        creature.db = -2
      }
    }
    if (CONFIG.debug.CoC7Importer) {
      console.debug('convert7E: ', creature)
    }
    return creature
  }
}
