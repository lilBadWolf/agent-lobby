import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import AuthScreen from '../AuthScreen.vue';

vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({
    close: vi.fn(),
  }),
}));

describe('AuthScreen', () => {
  it('keeps initialize disabled until presence is ready', () => {
    const wrapper = mount(AuthScreen, {
      props: {
        showAuth: true,
        appVersion: '0.1.7',
        authError: false,
        onlineAgentCount: 0,
        presenceReady: false,
        presenceStatus: 'connecting',
        presenceStatusMessage: 'CONNECTING TO SERVER...',
      },
      global: {
        stubs: {
          AuthBackground: true,
        },
      },
    });

    expect(wrapper.find('#login-btn').attributes('disabled')).toBeDefined();
    expect(wrapper.text()).toContain('CONNECTING TO SERVER...');
  });

  it('emits uppercase login handle and clears input', async () => {
    const wrapper = mount(AuthScreen, {
      props: {
        showAuth: true,
        appVersion: '0.1.7',
        authError: false,
        onlineAgentCount: 3,
        presenceReady: true,
        presenceStatus: 'ready',
        presenceStatusMessage: '3 AGENTS ONLINE',
      },
      global: {
        stubs: {
          AuthBackground: true,
        },
      },
    });

    const input = wrapper.find('#username-in');
    await input.setValue('agent42');
    await wrapper.find('#login-btn').trigger('click');

    expect(wrapper.emitted('login')?.[0]).toEqual(['AGENT42']);
    expect((input.element as HTMLInputElement).value).toBe('');
  });

  it('emits ambience and config-clicked from controls', async () => {
    const wrapper = mount(AuthScreen, {
      props: {
        showAuth: true,
        appVersion: '0.1.7',
        authError: false,
        onlineAgentCount: 1,
        presenceReady: true,
        presenceStatus: 'ready',
        presenceStatusMessage: '1 AGENT ONLINE',
      },
      global: {
        stubs: {
          AuthBackground: true,
        },
      },
    });

    await wrapper.find('#username-in').trigger('click');
    await wrapper.find('.config-btn').trigger('click');

    expect(wrapper.emitted('ambience')).toBeTruthy();
    expect(wrapper.emitted('config-clicked')).toBeTruthy();
  });

  it('shows app version in auth header label', () => {
    const wrapper = mount(AuthScreen, {
      props: {
        showAuth: true,
        appVersion: '0.1.7',
        authError: false,
        onlineAgentCount: 1,
        presenceReady: true,
        presenceStatus: 'ready',
        presenceStatusMessage: '1 AGENT ONLINE',
      },
      global: {
        stubs: {
          AuthBackground: true,
        },
      },
    });

    expect(wrapper.find('.app-version-label').text()).toBe('APP_VER:');
    expect(wrapper.find('.app-version-number').text()).toBe('0.1.7');
  });
});
