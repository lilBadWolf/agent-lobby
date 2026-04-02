import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import SinewaveBackground from '../SinewaveBackground.vue';

describe('SinewaveBackground', () => {
  it('renders grid and animated wave layers', () => {
    const wrapper = mount(SinewaveBackground);

    expect(wrapper.find('svg').exists()).toBe(true);
    expect(wrapper.findAll('.wave')).toHaveLength(3);
    expect(wrapper.find('.scanlines').exists()).toBe(true);
  });
});
