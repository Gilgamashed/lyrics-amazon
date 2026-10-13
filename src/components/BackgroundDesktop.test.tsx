import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BackgroundDesktop, PRESETS } from './BackgroundDesktop';
import { makeSong } from '../test/fixtures';

function renderBackground(overrides: Partial<Parameters<typeof BackgroundDesktop>[0]> = {}) {
  const onApplyPreset = vi.fn();
  const onChangeBackgroundTheme = vi.fn();
  render(
    <BackgroundDesktop
      currentSong={makeSong()}
      isPlaying
      onApplyPreset={onApplyPreset}
      backgroundTheme="amazon-music"
      onChangeBackgroundTheme={onChangeBackgroundTheme}
      {...overrides}
    />
  );
  return { onApplyPreset, onChangeBackgroundTheme };
}

describe('BackgroundDesktop', () => {
  it('renders the amazon-music mockup with the current song', () => {
    renderBackground();
    expect(screen.getByText('amazon music')).toBeInTheDocument();
    expect(screen.getByText('HOME')).toBeInTheDocument();
    expect(screen.getByText('Espresso')).toBeInTheDocument();
    expect(screen.getByText('Sabrina Carpenter')).toBeInTheDocument();
  });

  it('applies each window preset', () => {
    const { onApplyPreset } = renderBackground();
    for (const preset of PRESETS) {
      fireEvent.click(screen.getByText(preset.name));
      expect(onApplyPreset).toHaveBeenLastCalledWith(preset);
    }
  });

  it('reports theme changes from the switcher', () => {
    const { onChangeBackgroundTheme } = renderBackground();

    fireEvent.click(screen.getByText('Studio Glow'));
    expect(onChangeBackgroundTheme).toHaveBeenCalledWith('studio');

    fireEvent.click(screen.getByText('Clean Slate'));
    expect(onChangeBackgroundTheme).toHaveBeenCalledWith('minimal');

    fireEvent.click(screen.getByText('Amazon Music'));
    expect(onChangeBackgroundTheme).toHaveBeenCalledWith('amazon-music');
  });

  it('renders the studio and minimal backdrops with their theme content', () => {
    renderBackground({ backgroundTheme: 'studio' });
    expect(screen.getByText('Floating Lyrics Display')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Compact Mini Player/ })).toBeInTheDocument();
  });

  it('renders the minimal backdrop', () => {
    renderBackground({ backgroundTheme: 'minimal' });
    expect(screen.getByText('Minimal Workspace Mode')).toBeInTheDocument();
    const active = screen.getByText('Clean Slate').closest('button')!;
    expect(active.className).toContain('bg-cyan-500/20');
    expect(screen.getByText('Compact Mini Player')).toBeInTheDocument();
  });
});