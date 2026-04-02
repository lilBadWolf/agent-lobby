import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import NetworkConfigModal from '../NetworkConfigModal.vue';

describe('NetworkConfigModal', () => {
  it('emits update and close when saving valid trimmed config', async () => {
    const wrapper = mount(NetworkConfigModal, {
      props: {
        showModal: true,
        networkConfig: {
          mqttServer: 'wss://broker.emqx.io:8084/mqtt',
          defaultLobby: 'spy_terminal',
        },
      },
    });

    await wrapper.find('#mqtt-server').setValue('  wss://test.local/mqtt  ');
    await wrapper.find('#default-lobby').setValue('  ops_room  ');
    await wrapper.find('.save-btn').trigger('click');

    expect(wrapper.emitted('update')?.[0]).toEqual([
      { mqttServer: 'wss://test.local/mqtt', defaultLobby: 'ops_room' },
    ]);
    expect(wrapper.emitted('close')).toBeTruthy();
  });

  it('does not emit update for invalid empty values', async () => {
    const wrapper = mount(NetworkConfigModal, {
      props: {
        showModal: true,
        networkConfig: {
          mqttServer: 'wss://broker.emqx.io:8084/mqtt',
          defaultLobby: 'spy_terminal',
        },
      },
    });

    await wrapper.find('#mqtt-server').setValue('   ');
    await wrapper.find('.save-btn').trigger('click');

    expect(wrapper.emitted('update')).toBeFalsy();
  });
});
