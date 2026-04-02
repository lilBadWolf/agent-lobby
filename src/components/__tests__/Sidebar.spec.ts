import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import Sidebar from '../Sidebar.vue';

describe('Sidebar', () => {
  const users = {
    ALPHA: { username: 'ALPHA', dmAvailable: true, isBot: false },
    BRAVO: { username: 'BRAVO', dmAvailable: true, isBot: true },
    CHARLIE: { username: 'CHARLIE', dmAvailable: false, isBot: false, isAway: true },
  };

  it('shows online count, excludes current user, and orders bots first', () => {
    const wrapper = mount(Sidebar, {
      props: {
        users,
        currentUsername: 'ALPHA',
      },
    });

    expect(wrapper.text()).toContain('[3] AGENTS');

    const names = wrapper.findAll('.user-handle-btn').map((btn) => btn.text());
    expect(names).toEqual(['BRAVO', 'CHARLIE']);
  });

  it('shows DM button only when user is available and not away', () => {
    const wrapper = mount(Sidebar, {
      props: {
        users,
      },
    });

    const dmButtons = wrapper.findAll('.dm-btn');
    expect(dmButtons).toHaveLength(2);
  });

  it('emits action events from controls', async () => {
    const wrapper = mount(Sidebar, {
      props: {
        users,
      },
    });

    await wrapper.find('.away-toggle-btn').trigger('click');
    await wrapper.find('#disconnect-btn').trigger('click');
    await wrapper.findAll('.user-handle-btn')[0].trigger('click');
    await wrapper.findAll('.dm-btn')[0].trigger('click');

    expect(wrapper.emitted('toggleAway')).toBeTruthy();
    expect(wrapper.emitted('disconnect')).toBeTruthy();
    expect(wrapper.emitted('mentionRequest')?.[0]).toEqual(['BRAVO']);
    expect(wrapper.emitted('dmRequest')?.[0]).toEqual(['BRAVO']);
  });
});
