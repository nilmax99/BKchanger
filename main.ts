import { Plugin, TFile, WorkspaceLeaf ,ItemView} from 'obsidian';


interface BgSettings {
    path: string;
    blur: string;
    opacity: string;
    size: string;
    position: string;
    repeat: string;
}

export default class BackgroundPlugin extends Plugin {
    observer: IntersectionObserver;

    async onload() {
        this.addStyle();

        // 1. Setup Scroll Observer
        this.observer = new IntersectionObserver((entries) => {
            const entry = entries.find(e => e.isIntersecting);
            if (entry) {
                // Read settings stored in dataset
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

                // Store all settings as JSON in the element
                marker.dataset.settings = JSON.stringify(settings);

                // Show info in Edit Mode
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
            })
        );
    }

    onunload() {
        if (this.observer) this.observer.disconnect();
        const style = document.getElementById('bg-adv-style');
        if (style) style.remove();

        // Remove created background layers
        document.querySelectorAll('.custom-bg-layer').forEach(el => el.remove());
        document.querySelectorAll('.has-custom-bg').forEach(el => el.classList.remove('has-custom-bg'));
    }

    // --- Helper Functions ---

    parseSettings(source: string, sourcePath: string): BgSettings {
        const lines = source.split('\n');
        const settings: BgSettings = {
            path: '',
            blur: '0px',
            opacity: '1',
            size: 'cover',
            position: 'center center',
            repeat: 'no-repeat'
        };

        for (const line of lines) {
            const parts = line.split(':');
            if (parts.length < 2) continue;

            const key = parts[0].trim().toLowerCase();
            const value = parts.slice(1).join(':').trim(); // Handle URLs containing ':'

            switch (key) {
                case 'path':
                    settings.path = this.getImgPath(value, sourcePath) || '';
                    break;
                case 'blur':
                    // Append 'px' if user only types a number
                    settings.blur = value.endsWith('px') || value.endsWith('rem') || value === '0' ? value : value + 'px';
                    break;
                case 'opacity':
                    settings.opacity = value;
                    break;
                case 'size':
                    settings.size = value;
                    break;
                case 'position':
                    settings.position = value;
                    break;
                case 'repeat':
                    settings.repeat = value;
                    break;
            }
        }
        return settings;
    }

    getImgPath(fileName: string, sourcePath: string): string | null {
        const file = this.app.metadataCache.getFirstLinkpathDest(fileName, sourcePath);
        if (file instanceof TFile) {
            return this.app.vault.getResourcePath(file);
        }
        return null;
    }

    applySettingsToActiveLeaf(settings: BgSettings) {
        const activeLeaf = this.app.workspace.activeLeaf;
        if (!activeLeaf || !activeLeaf.view) return;

        // const container = activeLeaf.view.contentEl;
        const container = (activeLeaf.view as ItemView).contentEl;

        // 1. Enable transparency mode
        container.classList.add('has-custom-bg');

        // 2. Find or create specific background layer
        // Create a separate div so blur doesn't affect text
        let bgLayer = container.querySelector('.custom-bg-layer') as HTMLElement;
        if (!bgLayer) {
            bgLayer = document.createElement('div');
            bgLayer.className = 'custom-bg-layer';
            // Prepend layer to container (behind everything)
            container.prepend(bgLayer);
        }

        // 3. Apply styles to background layer
        bgLayer.style.backgroundImage = `url('${settings.path}')`;
        bgLayer.style.backgroundSize = settings.size;
        bgLayer.style.backgroundPosition = settings.position;
        bgLayer.style.backgroundRepeat = settings.repeat;
        bgLayer.style.opacity = settings.opacity;

        // Apply Blur
        bgLayer.style.filter = `blur(${settings.blur})`;

        // Smooth transition
        bgLayer.style.transition = 'all 0.5s ease-in-out';
    }

    resetBackground(leaf: WorkspaceLeaf | null) {
        if (!leaf || !leaf.view) return;
        const container = (leaf.view as any).contentEl;
        // const container = leaf.view.contentEl;

        // Remove transparency class
        container.classList.remove('has-custom-bg');

        // Remove background layer if exists
        const bgLayer = container.querySelector('.custom-bg-layer');
        if (bgLayer) {
            bgLayer.remove();
        }
    }

    addStyle() {
        const css = `
            /* === Editor Block Styles === */
            .bg-marker {
                padding: 8px; border: 1px dashed #555; border-radius: 6px;
                background: rgba(0,0,0,0.2); margin: 10px 0; font-size: 0.8em;
            }
            .bg-info { font-weight: bold; color: var(--text-normal); }
            .sub-text { font-weight: normal; color: var(--text-muted); font-size: 0.9em; }
            .bg-error { color: #ff5555; }

            /* Hide in Reading View */
            .markdown-reading-view .bg-marker { 
                display: block !important; height: 1px !important; opacity: 0 !important;
                margin: 0 !important; padding: 0 !important; pointer-events: none; overflow: hidden;
            }

            /* === Custom Background Layer === */
            .custom-bg-layer {
                position: absolute;
                top: 0; left: 0; right: 0; bottom: 0;
                z-index: 0; /* Behind text */
                pointer-events: none; /* Ignore clicks */
            }

            /* === Make Obsidian Layers Transparent === */
            .has-custom-bg .view-content { background-color: transparent !important; }
            
            /* Ensure text sits above background layer */
            .has-custom-bg .cm-editor, 
            .has-custom-bg .markdown-reading-view {
                position: relative;
                z-index: 1; /* Above background */
                background-color: transparent !important;
            }

            .has-custom-bg .markdown-preview-view { background: transparent !important; }
        `;

        const styleId = 'bg-adv-style';
        let style = document.getElementById(styleId);
        if (!style) {
            style = document.createElement('style');
            style.id = styleId;
            document.head.appendChild(style);
        }
        style.textContent = css;
    }
}