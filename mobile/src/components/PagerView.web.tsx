import React, { Children, Component, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

type PageSelectedEvent = {
  nativeEvent: { position: number };
};

type PagerViewProps = {
  style?: StyleProp<ViewStyle>;
  initialPage?: number;
  onPageSelected?: (event: PageSelectedEvent) => void;
  children?: ReactNode;
};

/**
 * Web shim for react-native-pager-view.
 * Shows one page at a time; page changes come from setPage (e.g. filter pills).
 */
export default class PagerView extends Component<PagerViewProps, { page: number }> {
  state = {
    page: this.props.initialPage ?? 0,
  };

  setPage = (selectedPage: number) => {
    this.setState({ page: selectedPage }, () => {
      this.props.onPageSelected?.({ nativeEvent: { position: selectedPage } });
    });
  };

  setPageWithoutAnimation = (selectedPage: number) => {
    this.setPage(selectedPage);
  };

  setScrollEnabled = (_scrollEnabled: boolean) => {
    // no-op on web
  };

  render() {
    const pages = Children.toArray(this.props.children);
    const active = pages[this.state.page] ?? null;
    return <View style={this.props.style}>{active}</View>;
  }
}
