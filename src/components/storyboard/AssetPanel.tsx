import { useMemo } from 'react';
import { useStore } from '../../store';
import { scanCompositionAssets, getAssetSummaries } from '../../lib/asset-utils';

const TYPE_ICONS: Record<string, string> = {
  image: 'IMG',
  video: 'VID',
  audio: 'AUD',
};

export function AssetPanel({ onClose }: { onClose: () => void }) {
  const composition = useStore((s) => s.composition);

  const summaries = useMemo(() => {
    const refs = scanCompositionAssets(composition);
    return getAssetSummaries(refs);
  }, [composition]);

  return (
    <div className="dialog-overlay" onClick={onClose}>
      <div className="dialog-panel asset-panel-dialog" onClick={(e) => e.stopPropagation()}>
        <h3>Assets ({summaries.length})</h3>

        {summaries.length === 0 && (
          <p className="prop-hint">No assets in this composition. Add image, video, or audio layers to see them here.</p>
        )}

        <div className="asset-list">
          {summaries.map((asset) => (
            <div key={asset.path} className="asset-item">
              <span className="asset-type-badge">{TYPE_ICONS[asset.type]}</span>
              <div className="asset-info">
                <span className="asset-path" title={asset.path}>
                  {asset.path.split(/[/\\]/).pop()}
                </span>
                <span className="asset-usages">
                  Used in: {asset.usages.map((u) => `${u.sceneLabel} / ${u.layerName}`).join(', ')}
                </span>
              </div>
            </div>
          ))}
        </div>

        <button className="dialog-close" onClick={onClose}>Close</button>
      </div>
    </div>
  );
}
