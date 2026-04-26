import { Text, type TextProps } from "react-native";

import { readableSiteColor } from "../lib/siteColor";

type Props = TextProps & {
  siteColorHex?: string;
  children: string;
};

export function SiteText({ siteColorHex, style, children, ...rest }: Props) {
  return (
    <Text style={[{ color: readableSiteColor(siteColorHex) }, style]} {...rest}>
      {children}
    </Text>
  );
}
