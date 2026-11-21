# Nik's Sequencer

A maintained fork of [Sequencer](https://github.com/fantasycalendar/FoundryVTT-Sequencer) by [Fantasy Computerworks](http://fantasycomputer.works/), with bug fixes and performance improvements on top of Sequencer 4.3.1.

- **Same module id (`sequencer`).** Modules that depend on Sequencer (Automated Animations, Trigger Animations and many more) work with it unchanged. It replaces Sequencer: install one or the other, not both.
- **Same API and documentation.** Everything in the [Sequencer wiki](https://fantasycomputer.works/FoundryVTT-Sequencer/) applies.
- **Versions** are the upstream version plus `.nX` (for example `4.3.1.n1`). See the [changelog](CHANGELOG.md) for what changed.

## Installation

Uninstall Sequencer first (your effects and settings stay in the world), then paste this manifest link into Foundry's **Install Module** dialog:

```
https://github.com/nschoenwald/niks-sequencer/releases/latest/download/module.json
```

To go back to the original, uninstall this fork and install Sequencer from the Foundry package list.

## What this fork changes

Compared to Sequencer 4.3.1:

- **Sounds:** sounds placed on a token are audible on Foundry V14 without `.alwaysForGMs()`. Located sounds nobody can hear yet start silently, become audible when a listener comes in range and end on time, instead of waiting forever. Players with several tokens hear a sound from the closest one.
- **Crosshairs:** `.crosshair().persist()` works with later sections on Foundry V14.
- **Effects:** `bindVisibility` follows hidden templates and regions.
- **Animations:** token updates sent close together are applied in order, so none get lost.
- **Spritesheets:** a video decoder failure ends the conversion instead of hanging.
- **Rendering optimizations** (can be turned off with the **Enable Rendering Optimizations** setting): mask caching, skipping effects with filters or masks while off-screen, no video uploads for hidden or off-screen video effects.
- **Less work per frame:** sounds placed on the canvas, attached `.stretchTo()` effects, effect animations, hooks for attached objects, video visibility checks, `.motion()` and reading saved persistent effects.

Bug reports for this fork: [issues](https://github.com/nschoenwald/niks-sequencer/issues). Please don't report problems with the fork to the upstream project.

---

The original Sequencer README follows.

---

# Sequencer (original README)

![Latest Release Download Count](https://img.shields.io/github/downloads/fantasycalendar/FoundryVTT-Sequencer/latest/module.zip?color=2b82fc&label=DOWNLOADS&style=for-the-badge) [![Forge Installs](https://img.shields.io/badge/dynamic/json?label=Forge%20Installs&query=package.installs&suffix=%25&url=https%3A%2F%2Fforge-vtt.com%2Fapi%2Fbazaar%2Fpackage%2Fsequencer&colorB=006400&style=for-the-badge)](https://forge-vtt.com/bazaar#package=sequencer) ![Foundry Verified Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fgithub.com%2Ffantasycalendar%2FFoundryVTT-Sequencer%2Freleases%2Flatest%2Fdownload%2Fmodule.json&label=Foundry%20Verified%20Version&query=$.compatibility.verified&colorB=orange&style=for-the-badge) ![Latest Version](https://img.shields.io/badge/dynamic/json.svg?url=https%3A%2F%2Fgithub.com%2Ffantasycalendar%2FFoundryVTT-Sequencer%2Freleases%2Flatest%2Fdownload%2Fmodule.json&label=Latest%20Release&prefix=v&query=$.version&colorB=red&style=for-the-badge)

![Animation showing the Sequencer](docs/images/Animation2.gif)

---

<img src="https://app.fantasy-calendar.com/resources/computerworks-logo-full.png" alt="Fantasy Computerworks Logo" style="width:250px;"/>

A module made by [Fantasy Computerworks](http://fantasycomputer.works/).

Other works by us:
- [Fantasy Calendar](https://app.fantasy-calendar.com) - The best calendar creator and management app on the internet
- [Item Piles](https://foundryvtt.com/packages/item-piles) - Drag & drop items into the scene to drop item piles that you can then easily pick up
- [Tagger](https://foundryvtt.com/packages/tagger) - Tag objects in the scene and retrieve them with a powerful API

---

## Support Us On Patreon

[<img src="docs/images/supportus.png" alt="Support us on patreon" style="width:250px;"/>](https://www.patreon.com/cw/fantasycomputerworks)

We love creating stuff and improving what we've made, but our day jobs take a good chunk out of our energy and time each day. Maintaining Sequencer is definitely something that requires effort and dedication, and with your help, we can continue to do so!

---

## What is Sequencer?

Sequencer is a powerful module that lets you play visual effects in your scenes, attaching them to tokens or other elements, animating them, quickly and easily removing them, play sounds for all or specific players, run macros one after another in a controlled way, and so much more.

## The new wiki can be found at [https://fantasycomputer.works/FoundryVTT-Sequencer/](https://fantasycomputer.works/FoundryVTT-Sequencer/)

## Effects shown on this wiki
* [JB2A - Jules&Ben's Animated Assets](https://foundryvtt.com/packages/JB2A_DnD5e) (Full paid version [here](https://www.patreon.com/JB2A))
* [Jack Kerouac's Animated Spell Effects](https://foundryvtt.com/packages/animated-spell-effects)
* [Jack Kerouac's Animated Cartoon Spell Effets](https://foundryvtt.com/packages/animated-spell-effects-cartoon)

## [Changelog](CHANGELOG.md)

## Installation

You can install it through the Foundry module installer, or by copy-pasting this link into the module installer:

[https://github.com/FantasyCalendar/FoundryVTT-Sequencer/releases/latest/download/module.json](https://github.com/FantasyCalendar/FoundryVTT-Sequencer/releases/latest/download/module.json)

If you want to test the beta track, you can install it from this link - **NOT RECOMMENDED FOR NOVICE USERS**:
[https://raw.githubusercontent.com/fantasycalendar/FoundryVTT-Sequencer/next/module.json](https://raw.githubusercontent.com/fantasycalendar/FoundryVTT-Sequencer/next/module.json)

## Contributing

Sequencer operates under the [MIT license](https://opensource.org/license/mit/), so feel free to contribute, fork, redistribute any part of the module.

## Developing Locally

To start running this module locally and developing for it, you will need to run the following commands in your terminal while in the directory of the module; `npm install` -> `npm run build` -> `npm run dev` 

## Credits
### Feedback and amazing help
* U-man over at [FXMaster](https://gitlab.com/mesfoliesludiques/foundryvtt-fxmaster) for his implementation of layers - Copyright © 2020 Emmanuel Ruaud
* Otigon with his [Automated Animations](https://github.com/otigon/automated-jb2a-animations) for his work on handling standardized effects - Copyright © 2020 Otigon
* honeybadger (badgerweks on discord) for getting me up to speed with all things crosshairs!
* ghost (ghost#2000 on discord) for his fixes to the audio sections
* Kandashi (Kandashi#6698 on discord) for the inspiration and code of persistent effects
* Naito (Naito#1235 on discord) for his assistance with improving the Database Viewer's speed
* League of Extraordinary FoundryVTT Developers for their ongoing support and suggestions
* Foundry VTT Core code for heaps of inspiration

### Other Attributions
- [Easing Functions Cheat Sheet](https://easings.net/) ([GitHub](https://github.com/ai/easings.net)) - Copyright © 2020 Andrey Sitnik and Ivan Solovev
