import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import GlobalBanners from '../GlobalBanners';

describe('GlobalBanners', () => {
  it('affiche la bannière Support seule avec l’action Quitter accessible', () => {
    render(
      <GlobalBanners>
        <div data-testid="support-banner"><button>Quitter la Vue Support</button></div>
      </GlobalBanners>
    );

    expect(screen.getByTestId('support-banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Quitter la Vue Support' })).toBeInTheDocument();
    expect(screen.queryByTestId('abonnement-banner')).not.toBeInTheDocument();
  });

  it('affiche la bannière abonnement seule', () => {
    render(
      <GlobalBanners>
        <div data-testid="abonnement-banner">Votre abonnement expire bientôt.</div>
      </GlobalBanners>
    );

    expect(screen.getByTestId('abonnement-banner')).toBeInTheDocument();
    expect(screen.queryByTestId('support-banner')).not.toBeInTheDocument();
  });

  it('empile Support et abonnement dans la même zone sticky', () => {
    render(
      <GlobalBanners>
        <div data-testid="support-banner"><button>Quitter la Vue Support</button></div>
        <div data-testid="abonnement-banner">Votre abonnement expire bientôt.</div>
      </GlobalBanners>
    );

    const zone = screen.getByTestId('global-banners');
    expect(within(zone).getByTestId('support-banner')).toBeInTheDocument();
    expect(within(zone).getByTestId('abonnement-banner')).toBeInTheDocument();
    expect(within(zone).getByRole('button', { name: 'Quitter la Vue Support' })).toBeInTheDocument();
  });
});
