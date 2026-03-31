import { useState } from 'react';
import { openUrl } from '@tauri-apps/plugin-opener';

import { getTranslations } from '../../i18n';
import { useAppStore } from '../../stores/appStore';
import './help.css';

const VERSION = '0.1.1';
const GITHUB_URL = 'https://github.com/BrianIS8090/';
const EMAIL = 'ilmir8090@gmail.com';

type HelpTab = 'about' | 'markdown' | 'shortcuts';

interface HelpDialogProps {
  onClose: () => void;
}

export function HelpDialog({ onClose }: HelpDialogProps) {
  const language = useAppStore((s) => s.language);
  const t = getTranslations(language);
  const [activeTab, setActiveTab] = useState<HelpTab>('about');

  const handleOpenLink = async (url: string) => {
    try {
      await openUrl(url);
    } catch (e) {
      console.error('Ошибка открытия ссылки:', e);
    }
  };

  return (
    <div className="help-overlay" onClick={onClose}>
      <div className="help-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="help-header">
          <div className="help-header-main">
            <div className="help-icon">📝</div>
            <div className="help-title">
              <span className="help-eyebrow">{t.helpTitle}</span>
              <h2>Mivra</h2>
            </div>
          </div>
          <span className="help-version">{t.version}: {VERSION}</span>
        </div>

        <div className="help-tabs">
          <button
            className={`help-tab ${activeTab === 'about' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('about')}
          >
            {t.helpTabAbout}
          </button>
          <button
            className={`help-tab ${activeTab === 'markdown' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('markdown')}
          >
            {t.helpTabMarkdown}
          </button>
          <button
            className={`help-tab ${activeTab === 'shortcuts' ? 'is-active' : ''}`}
            onClick={() => setActiveTab('shortcuts')}
          >
            {t.helpTabShortcuts}
          </button>
        </div>

        <div className="help-body">
          {activeTab === 'about' && (
            <div className="help-section">
              <p className="help-description">{t.description}</p>

              <div className="help-section">
                <h3>{t.license}</h3>
                <p>{t.mitLicense}</p>
              </div>

              <div className="help-section">
                <h3>{t.author}</h3>
                <p>BrianIS</p>
              </div>

              <div className="help-section">
                <h3>{t.contact}</h3>
                <div className="help-links">
                  <button
                    className="help-link"
                    onClick={() => handleOpenLink(GITHUB_URL)}
                  >
                    GitHub
                  </button>
                  <button
                    className="help-link"
                    onClick={() => handleOpenLink(`mailto:${EMAIL}`)}
                  >
                    {EMAIL}
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'markdown' && (
            <div className="help-section">
              <p className="help-intro">{t.helpMarkdownIntro}</p>
              <div className="help-grid">
                {t.helpMarkdownCards.map((card) => (
                  <div className="help-card" key={card.title}>
                    <div className="help-card-title">{card.title}</div>
                    <pre className="help-card-example"><code>{card.example}</code></pre>
                    <div className="help-card-description">{card.description}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'shortcuts' && (
            <div className="help-section">
              <p className="help-intro">{t.helpShortcutsIntro}</p>
              {t.helpShortcutsGroups.map((group) => (
                <div className="help-shortcut-group" key={group.title}>
                  <h3>{group.title}</h3>
                  <div className="help-shortcut-list">
                    {group.items.map((item) => (
                      <div className="help-shortcut-item" key={`${group.title}-${item.keys}`}>
                        <span className="help-shortcut-keys">{item.keys}</span>
                        <span className="help-shortcut-desc">{item.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <div className="help-note">{t.helpShortcutsNote}</div>
            </div>
          )}
        </div>

        <div className="help-footer">
          <button className="help-close-btn" onClick={onClose}>
            {t.close}
          </button>
        </div>
      </div>
    </div>
  );
}
