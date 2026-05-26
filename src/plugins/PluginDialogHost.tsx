import { useEffect, useRef } from 'react';
import { createMivraPluginApi } from './mivraApi';
import { usePluginStore } from './pluginStore';
import type { RegisteredDialog } from './types';

type RendererDialogProps = {
  dialog: Extract<RegisteredDialog, { kind: 'renderer' }>;
  props: Record<string, unknown>;
};

function PluginRendererDialog({ dialog, props }: RendererDialogProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    const cleanup = dialog.renderer.render({
      container: containerRef.current,
      props,
      api: createMivraPluginApi(dialog.pluginId),
    });

    return () => {
      if (cleanup) cleanup();
      if (containerRef.current) {
        containerRef.current.innerHTML = '';
      }
    };
  }, [dialog, props]);

  return <div ref={containerRef} />;
}

export function PluginDialogHost() {
  const dialogs = usePluginStore((s) => s.dialogs);
  const openDialogs = usePluginStore((s) => s.openDialogs);

  return (
    <>
      {openDialogs.map((open) => {
        const dialog = dialogs.find((item) => item.id === open.id);
        if (!dialog) return null;
        if (dialog.kind === 'renderer') {
          return <PluginRendererDialog key={open.id} dialog={dialog} props={open.props} />;
        }
        const Component = dialog.component;
        return <Component key={open.id} {...open.props} />;
      })}
    </>
  );
}
