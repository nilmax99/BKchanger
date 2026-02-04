import { Plugin, TFile, WorkspaceLeaf, ItemView, PluginSettingTab, App, Setting } from 'obsidian';

// ============================================================
// 1. Central Configuration
// ============================================================

// Define all available styles and their display names here.
// To add a new style, simply add a line to this object.
const STYLE_DEFINITIONS = {
    glass: 'Glass (Standard Blur)',
    frost: 'Frost (Heavy Blur - Icy Look)',
    mist: 'Mist (Light Blur - Steamy)',
    crisp: 'Crisp (No Blur - Darker)',
    card: 'Card (Solid - High Contrast)',
    float: 'Float (Transparent)',
    zen: 'Zen (Ultra Low Blur - Focus)',
    off: 'Off (Disable Plugin)'
} as const;

// Automatically derive the StyleMode type from the keys above
export type StyleMode = keyof typeof STYLE_DEFINITIONS;

// ============================================================
// 2. Style Manager Class (Helper)
// ============================================================
export class StyleManager {
    // Get all style keys (glass, frost, etc.)
    static get keys(): StyleMode[] {
        return Object.keys(STYLE_DEFINITIONS) as StyleMode[];
    }

    // Get all CSS class names to remove (e.g., ['bg-style-glass', ...])
    static get cssClasses(): string[] {
        return this.keys.map(k => `bg-style-${k}`);
    }

    // Type Guard: Check if a string is a valid style mode
    static isValid(value: string): value is StyleMode {
        return value in STYLE_DEFINITIONS;
    }

    // Get the display label for settings
    static getLabel(mode: StyleMode): string {
        return STYLE_DEFINITIONS[mode];
    }

    // Get the specific CSS class for a mode
    static getClass(mode: StyleMode): string {
        return `bg-style-${mode}`;
    }
}

// ============================================================
// 3. Settings Interfaces
// ============================================================

interface PluginSettings {
    styleMode: StyleMode;
}

const DEFAULT_SETTINGS: PluginSettings = {
    styleMode: 'glass'
}

interface BgSettings {
    path: string;
    blur: string;
    opacity: string;
    size: string;
    position: string;
    repeat: string;
    style?: StyleMode;
}

// ============================================================
// 4. Main Plugin Class
// ============================================================

export default class BackgroundPlugin extends Plugin {
    settings: PluginSettings;
    observer: IntersectionObserver;

    async onload() {
        await this.loadSettings();

        // Add Settings Tab
        this.addSettingTab(new BackgroundSettingTab(this.app, this));

        // Apply global style to body
        this.updateStyleClass();

        // 1. Setup Scroll Observer
        this.observer = new IntersectionObserver((entries) => {
            const entry = entries.find(e => e.isIntersecting);
            if (entry) {
                const settingsJson = (entry.target as HTMLElement).dataset.settings;
                if (settingsJson) {
                    const settings: BgSettings = JSON.parse(settingsJson);
                    this.applySettingsToActiveLeaf(settings);
                }
            }
        }, { threshold: 0.01, rootMargin: "0px 0px -50% 0px" });

        // 2. Process 'bg' code blocks
        this.registerMarkdownCodeBlockProcessor("bg", (source, el, ctx) => {
            const settings = this.parseSettings(source, ctx.sourcePath);
            if (settings.path) {
                const marker = el.createDiv({ cls: 'bg-marker' });
                marker.dataset.settings = JSON.stringify(settings);

                // Show info in Edit Mode
                const info = marker.createDiv({ cls: 'bg-info' });
                const rawName = settings.path.split('/').pop() || '';
                const cleanName = rawName.split('?')[0];
                info.innerText = `🖼 ${cleanName}`;

                if (settings.blur !== '0px') {
                    info.createDiv({ text: `💧 Blur: ${settings.blur}`, cls: 'sub-text' });
                }

                this.observer.observe(marker);
            } else {
                el.createDiv({ text: '❌ No "path:" found in bg block', cls: 'bg-error' });
            }
        });

        // 3. Clean up when file changes
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                this.resetBackground(leaf);
                // Re-apply global class just in case
                this.updateStyleClass();
            })
        );
    }

    onunload() {
        if (this.observer) this.observer.disconnect();

        // Clean up global classes
        document.body.classList.remove(...StyleManager.cssClasses);

        // Remove created elements
        document.querySelectorAll('.custom-bg-layer').forEach(el => el.remove());
        document.querySelectorAll('.has-custom-bg').forEach(el => el.classList.remove('has-custom-bg'));
    }

    async loadSettings() {
        this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
    }

    async saveSettings() {
        await this.saveData(this.settings);
        this.updateStyleClass();
    }

    updateStyleClass() {
        // Remove all possible style classes
        document.body.classList.remove(...StyleManager.cssClasses);
        // Add the current global style class
        document.body.classList.add(StyleManager.getClass(this.settings.styleMode));
    }

    // --- Helper Functions ---

    parseSettings(source: string, sourcePath: string): BgSettings {
        const lines = source.split('\n');
        const settings: BgSettings = {
            path: '', blur: '0px', opacity: '1', size: 'cover', position: 'center center', repeat: 'no-repeat'
        };

        for (const line of lines) {
            const parts = line.split(':');
            if (parts.length < 2) continue;
            const key = parts[0].trim().toLowerCase();
            const value = parts.slice(1).join(':').trim();

            switch (key) {
                case 'path': settings.path = this.getImgPath(value, sourcePath) || ''; break;
                case 'blur': settings.blur = value.endsWith('px') || value.endsWith('rem') || value === '0' ? value : value + 'px'; break;
                case 'opacity': settings.opacity = value; break;
                case 'size': settings.size = value; break;
                case 'position': settings.position = value; break;
                case 'repeat': settings.repeat = value; break;

                case 'style':
                    // Validate style using the manager
                    if (StyleManager.isValid(value)) {
                        settings.style = value;
                    }
                    break;
            }
        }
        return settings;
    }

    getImgPath(fileName: string, sourcePath: string): string | null {
        const file = this.app.metadataCache.getFirstLinkpathDest(fileName, sourcePath);
        if (file instanceof TFile) return this.app.vault.getResourcePath(file);
        return null;
    }

    applySettingsToActiveLeaf(settings: BgSettings) {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!activeLeaf || !activeLeaf.view) return;

        const container = (activeLeaf.view as ItemView).contentEl;
        container.classList.add('has-custom-bg');

        // Remove any previous style classes from this container
        container.classList.remove(...StyleManager.cssClasses);

        // Determine effective style (Note specific > Global setting)
        const effectiveStyle = settings.style || this.settings.styleMode;

        // Apply the new style class
        container.classList.add(StyleManager.getClass(effectiveStyle));

        // Create or update the background image layer
        let bgLayer = container.querySelector('.custom-bg-layer') as HTMLElement;
        if (!bgLayer) {
            bgLayer = document.createElement('div');
            bgLayer.className = 'custom-bg-layer';
            container.prepend(bgLayer);
        }

        bgLayer.style.backgroundImage = `url('${settings.path}')`;
        bgLayer.style.backgroundSize = settings.size;
        bgLayer.style.backgroundPosition = settings.position;
        bgLayer.style.backgroundRepeat = settings.repeat;
        bgLayer.style.opacity = settings.opacity;
        bgLayer.style.filter = `blur(${settings.blur})`;
        bgLayer.style.transition = 'all 0.5s ease-in-out';
    }

    resetBackground(leaf: WorkspaceLeaf | null) {
        if (!leaf || !leaf.view) return;
        const container = (leaf.view as any).contentEl;

        container.classList.remove('has-custom-bg');

        // Remove all style classes
        container.classList.remove(...StyleManager.cssClasses);

        const bgLayer = container.querySelector('.custom-bg-layer');
        if (bgLayer) bgLayer.remove();
    }
}

// ============================================================
// 5. Settings Tab
// ============================================================

class BackgroundSettingTab extends PluginSettingTab {
    plugin: BackgroundPlugin;

    constructor(app: App, plugin: BackgroundPlugin) {
        super(app, plugin);
        this.plugin = plugin;
    }

    display(): void {
        const { containerEl } = this;
        containerEl.empty();

        containerEl.createEl('h2', { text: 'Dynamic Background Settings' });

        new Setting(containerEl)
            .setName('Text Box Style')
            .setDesc('Choose the visual style for the text container.')
            .addDropdown(dropdown => {
                // Dynamically populate options from StyleManager
                StyleManager.keys.forEach(key => {
                    dropdown.addOption(key, StyleManager.getLabel(key));
                });

                dropdown
                    .setValue(this.plugin.settings.styleMode)
                    .onChange(async (value) => {
                        if (StyleManager.isValid(value)) {
                            this.plugin.settings.styleMode = value;
                            await this.plugin.saveSettings();
                        }
                    });
            });
    }
}