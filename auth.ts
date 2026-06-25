import NextAuth from "next-auth";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_CLIENT_ID!,
      clientSecret: process.env.AUTH_MICROSOFT_CLIENT_SECRET!,
      tenantId: process.env.AUTH_MICROSOFT_TENANT_ID!,
      issuer: `https://login.microsoftonline.com/${process.env.AUTH_MICROSOFT_TENANT_ID}/v2.0`,
      authorization: {
        params: { scope: "openid profile email User.Read" },
      },
    }),
  ],
  callbacks: {
    async signIn({ profile }) {
      // Microsoft may return email as `email`, `preferred_username`, or `upn`
      const email = (
        (profile as Record<string, unknown>)?.email ??
        (profile as Record<string, unknown>)?.preferred_username ??
        (profile as Record<string, unknown>)?.upn ??
        ""
      ) as string;
      return email.toLowerCase().endsWith("@nlec.org.au");
    },
    async jwt({ token, profile }) {
      if (profile) {
        token.email =
          (profile as Record<string, unknown>).email ??
          (profile as Record<string, unknown>).preferred_username ??
          token.email;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.email) session.user.email = token.email as string;
      return session;
    },
  },
  pages: {
    signIn: "/login",
    error: "/login",
  },
});
