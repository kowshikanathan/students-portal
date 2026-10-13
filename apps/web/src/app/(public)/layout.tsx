import { Header } from '@/components/header';
import { Footer } from '@/components/footer';
import { ConsentProvider } from '@/components/consent';
import { Chat } from '@/components/chat';
import { site } from '@/lib/published';
export const dynamic = 'force-dynamic';
export default async function Layout({ children }: { children: React.ReactNode }) {
  const config = await site();
  // Legacy CMS brand defaults are not authoritative for the new Dodo product
  // identity. Preserve institution-specific names and custom owner brands.
  const legacyBrand = ['Jodo', 'YourCompany'].includes(config.settings.brand.name);
  const brandName =
    !config.tenantSite && legacyBrand
      ? process.env.NEXT_PUBLIC_BRAND_NAME &&
        !['Jodo', 'YourCompany'].includes(process.env.NEXT_PUBLIC_BRAND_NAME)
        ? process.env.NEXT_PUBLIC_BRAND_NAME
        : 'Dodo'
      : config.settings.brand.name;
  const shell = (
    <div
      style={
        {
          '--blue': config.settings.brand.primary,
          '--brand': config.settings.brand.primary,
        } as React.CSSProperties
      }
    >
      <Header navigation={config.settings.navigation} name={brandName} />
      <div className="demo-strip">
        Reference feature build · Live financial providers stay disabled until configured and
        approved <a href="/terms-and-conditions/">Platform boundaries</a>
      </div>
      <main id="main">{children}</main>
      <Footer name={config.settings.brand.name} />
      {!config.tenantSite && <Chat />}
    </div>
  );
  return config.tenantSite ? shell : <ConsentProvider>{shell}</ConsentProvider>;
}
