import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  SafeAreaView,
  StyleSheet,
  View,
} from 'react-native';
import { WebView } from 'react-native-webview';

/**
 * RS App — iOS wrapper (TestFlight).
 *
 * Thin WebView over the live PWA at app.rowlystudios.com. The WebView
 * appends "RSAppiOS" to its User-Agent; the site's middleware uses that
 * to keep /admin a desktop-web-only surface — the admin overview never
 * renders inside this app.
 */

const APP_URL = 'https://app.rowlystudios.com';
const BRAND_NAVY = '#496275';
const BRAND_CREAM = '#FBF5E4';

export default function App() {
  const webRef = useRef(null);
  const [loading, setLoading] = useState(true);

  const onShouldStartLoadWithRequest = (request) => {
    const url = request?.url ?? '';
    // Hand system-level schemes to iOS; everything web stays in the view
    // (Stripe Checkout included).
    if (/^(mailto:|tel:|sms:|maps:|itms-)/i.test(url)) {
      Linking.openURL(url).catch(() => {});
      return false;
    }
    return true;
  };

  return (
    <SafeAreaView style={styles.safe}>
      <StatusBar style="light" />
      <WebView
        ref={webRef}
        source={{ uri: APP_URL }}
        applicationNameForUserAgent="RSAppiOS/1.0"
        allowsBackForwardNavigationGestures
        pullToRefreshEnabled
        onLoadEnd={() => setLoading(false)}
        onShouldStartLoadWithRequest={onShouldStartLoadWithRequest}
        style={styles.web}
      />
      {loading ? (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator size="large" color={BRAND_CREAM} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: BRAND_NAVY },
  web: { flex: 1, backgroundColor: BRAND_NAVY },
  loading: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: BRAND_NAVY,
  },
});
