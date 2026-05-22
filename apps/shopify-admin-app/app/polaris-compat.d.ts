import "@shopify/polaris";

declare module "@shopify/polaris" {
  interface TextProps {
    as?: any;
    color?: string;
    tone?: string;
  }

  interface ButtonProps {
    primary?: boolean;
    plain?: boolean;
    destructive?: boolean;
    tone?: string;
    variant?: string;
  }

  interface BadgeProps {
    status?: string;
    tone?: string;
  }

  interface BlockStackProps {
    vertical?: boolean;
  }

  interface TextFieldProps {
    autoComplete?: string;
  }
}
