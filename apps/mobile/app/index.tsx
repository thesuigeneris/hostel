import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { api } from '../lib/api';
import { theme } from '../lib/theme';

export default function Welcome() {
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(true);

  useEffect(() => {
    (async () => {
      const signedIn = await api.auth.isSignedIn();
      if (signedIn) router.replace('/(tabs)/home');
      else setBootstrapping(false);
    })();
  }, []);

  const sendOtp = async () => {
    if (phone.length < 10) {
      Alert.alert('Enter a 10-digit phone number');
      return;
    }
    setLoading(true);
    try {
      const res = await api.auth.requestOtp({ phone: `+91${phone}` });
      setDevOtp(res.devOtp);
      setStep('otp');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) {
      Alert.alert('Enter the 6-digit OTP');
      return;
    }
    setLoading(true);
    try {
      await api.auth.verify({ phone: `+91${phone}`, otp });
      router.replace('/(tabs)/home');
    } catch (e) {
      Alert.alert('Invalid OTP', e instanceof Error ? e.message : 'Try again');
    } finally {
      setLoading(false);
    }
  };

  if (bootstrapping) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.colors.bg }}>
      <KeyboardAvoidingView
        style={{ flex: 1, padding: theme.spacing.xl, justifyContent: 'space-between' }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View>
          <Text
            style={{
              fontSize: 36,
              fontWeight: '800',
              color: theme.colors.text,
              marginTop: theme.spacing.xxl,
              lineHeight: 42,
            }}
          >
            Live anywhere.{'\n'}Eat well.{'\n'}No advance.
          </Text>
          <Text
            style={{
              fontSize: 16,
              color: theme.colors.muted,
              marginTop: theme.spacing.lg,
              lineHeight: 22,
            }}
          >
            Subscription living for hostels and PGs. Pay one monthly fee. Move freely between
            partner properties.
          </Text>
        </View>

        <View>
          {step === 'phone' ? (
            <>
              <Text
                style={{
                  fontSize: 13,
                  color: theme.colors.muted,
                  marginBottom: theme.spacing.sm,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                }}
              >
                Phone number
              </Text>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  paddingHorizontal: theme.spacing.md,
                }}
              >
                <Text
                  style={{ fontSize: 18, color: theme.colors.text, marginRight: theme.spacing.sm }}
                >
                  +91
                </Text>
                <TextInput
                  style={{
                    flex: 1,
                    fontSize: 18,
                    paddingVertical: theme.spacing.md,
                    color: theme.colors.text,
                  }}
                  value={phone}
                  onChangeText={(v) => setPhone(v.replace(/\D/g, '').slice(0, 10))}
                  keyboardType="phone-pad"
                  placeholder="98765 43210"
                  placeholderTextColor={theme.colors.muted}
                  autoFocus
                />
              </View>
              <TouchableOpacity
                onPress={sendOtp}
                disabled={loading}
                style={{
                  backgroundColor: theme.colors.primary,
                  paddingVertical: theme.spacing.lg,
                  borderRadius: theme.radius.md,
                  marginTop: theme.spacing.lg,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.primaryText,
                    textAlign: 'center',
                    fontSize: 16,
                    fontWeight: '600',
                  }}
                >
                  {loading ? 'Sending...' : 'Send OTP'}
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Text
                style={{ fontSize: 14, color: theme.colors.muted, marginBottom: theme.spacing.sm }}
              >
                OTP sent to +91 {phone}
              </Text>
              {devOtp && (
                <Text
                  style={{
                    fontSize: 12,
                    color: theme.colors.accent,
                    marginBottom: theme.spacing.sm,
                  }}
                >
                  Dev OTP: {devOtp}
                </Text>
              )}
              <TextInput
                style={{
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  borderRadius: theme.radius.md,
                  paddingVertical: theme.spacing.md,
                  paddingHorizontal: theme.spacing.lg,
                  fontSize: 22,
                  color: theme.colors.text,
                  letterSpacing: 6,
                  textAlign: 'center',
                }}
                value={otp}
                onChangeText={(v) => setOtp(v.replace(/\D/g, '').slice(0, 6))}
                keyboardType="number-pad"
                placeholder="••••••"
                placeholderTextColor={theme.colors.muted}
                autoFocus
              />
              <TouchableOpacity
                onPress={verifyOtp}
                disabled={loading}
                style={{
                  backgroundColor: theme.colors.primary,
                  paddingVertical: theme.spacing.lg,
                  borderRadius: theme.radius.md,
                  marginTop: theme.spacing.lg,
                  opacity: loading ? 0.6 : 1,
                }}
              >
                <Text
                  style={{
                    color: theme.colors.primaryText,
                    textAlign: 'center',
                    fontSize: 16,
                    fontWeight: '600',
                  }}
                >
                  {loading ? 'Verifying...' : 'Verify & continue'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setStep('phone');
                  setOtp('');
                }}
                style={{ marginTop: theme.spacing.md }}
              >
                <Text style={{ color: theme.colors.muted, textAlign: 'center', fontSize: 14 }}>
                  Change number
                </Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
