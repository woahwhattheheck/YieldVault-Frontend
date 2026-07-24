import { render, screen } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import RouteAnnouncer from './RouteAnnouncer';

describe('RouteAnnouncer', () => {
  it('announces home page route', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteAnnouncer />
      </MemoryRouter>
    );

    const announcer = screen.getByRole('status');
    expect(announcer).toHaveAttribute('aria-live', 'polite');
    expect(announcer).toHaveAttribute('aria-atomic', 'true');
    expect(announcer).toHaveTextContent('Home page');
  });

  it('announces dashboard route', () => {
    render(
      <MemoryRouter initialEntries={['/dashboard']}>
        <RouteAnnouncer />
      </MemoryRouter>
    );

    const announcer = screen.getByRole('status');
    expect(announcer).toHaveTextContent('Dashboard page');
  });

  it('announces positions route', () => {
    render(
      <MemoryRouter initialEntries={['/positions']}>
        <RouteAnnouncer />
      </MemoryRouter>
    );

    const announcer = screen.getByRole('status');
    expect(announcer).toHaveTextContent('Positions page');
  });

  it('announces vault detail route for dynamic paths', () => {
    render(
      <MemoryRouter initialEntries={['/vault/123']}>
        <RouteAnnouncer />
      </MemoryRouter>
    );

    const announcer = screen.getByRole('status');
    expect(announcer).toHaveTextContent('Vault detail page');
  });

  it('announces page not found for unknown routes', () => {
    render(
      <MemoryRouter initialEntries={['/unknown-route']}>
        <RouteAnnouncer />
      </MemoryRouter>
    );

    const announcer = screen.getByRole('status');
    expect(announcer).toHaveTextContent('Page not found');
  });

  it('is visually hidden but accessible to screen readers', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <RouteAnnouncer />
      </MemoryRouter>
    );

    const announcer = screen.getByRole('status');
    const styles = window.getComputedStyle(announcer);
    
    expect(styles.position).toBe('absolute');
    expect(styles.left).toBe('-10000px');
    expect(styles.width).toBe('1px');
    expect(styles.height).toBe('1px');
    expect(styles.overflow).toBe('hidden');
  });

  it('updates announcement when route changes', () => {
    const { rerender } = render(
      <MemoryRouter initialEntries={['/']}>
        <RouteAnnouncer />
      </MemoryRouter>
    );

    let announcer = screen.getByRole('status');
    expect(announcer).toHaveTextContent('Home page');

    rerender(
      <MemoryRouter initialEntries={['/dashboard']}>
        <RouteAnnouncer />
      </MemoryRouter>
    );

    announcer = screen.getByRole('status');
    expect(announcer).toHaveTextContent('Dashboard page');
  });
});
