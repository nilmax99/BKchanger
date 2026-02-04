import { Plugin, TFile, WorkspaceLeaf, ItemView, PluginSettingTab, App, Setting } from 'obsidian';

// Plugin Settings Interface
interface PluginSettings {
    styleMode: 'glass' | 'float' | 'card' | 'crisp' | 'off';
}

const DEFAULT_SETTINGS: PluginSettings = {
    styleMode: 'glass'
}

// Per-file Background Settings Interface
interface BgSettings {
    path: string;
    blur: string;
    opacity: string;
    size: string;
    position: string;
    repeat: string;
    style?: 'glass' | 'float' | 'card' | 'crisp' | 'off';
}

export default class BackgroundPlugin extends Plugin {
    settings: PluginSettings;
    observer: IntersectionObserver;

    async onload() {
        // Load settings
        await this.loadSettings();

        // Add Settings Tab
        this.addSettingTab(new BackgroundSettingTab(this.app, this));

        // Apply global style class
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
        }, {
            threshold: 0.01,
            rootMargin: "0px 0px -50% 0px"
        });

        // 2. Process 'bg' code blocks
        this.registerMarkdownCodeBlockProcessor("bg", (source, el, ctx) => {
            const settings = this.parseSettings(source, ctx.sourcePath);

            if (settings.path) {
                const marker = el.createDiv({ cls: 'bg-marker' });
                marker.dataset.settings = JSON.stringify(settings);

                const info = marker.createDiv({ cls: 'bg-info' });
                const rawName = settings.path.split('/').pop() || '';
                const cleanName = rawName.split('?')[0];
                info.innerText = `🖼 ${cleanName}`;
                if (settings.blur !== '0px') info.createDiv({ text: `💧 Blur: ${settings.blur}`, cls: 'sub-text' });

                this.observer.observe(marker);
            } else {
                el.createDiv({ text: '❌ No "path:" found in bg block', cls: 'bg-error' });
            }
        });

        // 3. Clean up when file changes
        this.registerEvent(
            this.app.workspace.on('active-leaf-change', (leaf) => {
                this.resetBackground(leaf);
                this.updateStyleClass();
            })
        );
    }

    onunload() {
        if (this.observer) this.observer.disconnect();
        document.body.classList.remove('bg-style-glass', 'bg-style-crisp', 'bg-style-card', 'bg-style-float', 'bg-style-off');
        
        
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

    // Applies the global CSS class based on user settings
    updateStyleClass() {
        document.body.classList.remove('bg-style-glass', 'bg-style-crisp', 'bg-style-card', 'bg-style-float', 'bg-style-off');
        document.body.classList.add(`bg-style-${this.settings.styleMode}`);
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
                    if (['glass', 'card' , 'float' ,'crisp', 'off'].includes(value)) {
                        settings.style = value as 'glass' | 'float' | 'card' | 'crisp' | 'off';
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

        container.classList.remove('bg-style-glass', 'bg-style-crisp', 'bg-style-card', 'bg-style-float', 'bg-style-off');

        const effectiveStyle = settings.style || this.settings.styleMode;
        container.classList.add(`bg-style-${effectiveStyle}`);


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
        const bgLayer = container.querySelector('.custom-bg-layer');
        if (bgLayer) bgLayer.remove();
    }
}

// Settings Tab Class
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
            .addDropdown(dropdown => dropdown
                .addOption('glass', 'Glass (Blur + Noise)')
                .addOption('crisp', 'Crisp (Readable, No Banding)')
                .addOption('off', 'Off (Image Only)')
                .setValue(this.plugin.settings.styleMode)
                .onChange(async (value) => {
                    this.plugin.settings.styleMode = value as 'glass' | 'crisp' | 'off';
                    await this.plugin.saveSettings();
                }));
    }
}