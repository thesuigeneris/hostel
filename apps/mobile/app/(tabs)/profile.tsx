import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import type { User } from '../../lib/legacy-types';
import { api } from '../../lib/api';
import { theme } from '../../lib/theme';

export default function Profile() {
  const [user, setUser] = useState<User | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const u = await api.me.get();
      setUser(u);
      setName(u.name);
      setEmail(u.email ?? '');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  const save = async () => {
    setSaving(true);
    try {
      await api.me.update({ name, email: email || null });
      Alert.alert('Saved');
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed');
    } finally {
      setSaving(false);
    }
  };

  const signOut = async () => {
    await api.auth.signOut();
    router.replace('/');
  };

  if (loading || !user) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: theme.colors.bg,
        }}
      >
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: theme.spacing.xl, backgroundColor: theme.colors.bg }}>
      <Text
        style={{
          fontSize: 13,
          color: theme.colors.muted,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Phone
      </Text>
      <Text
        style={{
          fontSize: 18,
          color: theme.colors.text,
          marginTop: 4,
          marginBottom: theme.spacing.xl,
        }}
      >
        {user.phone}
      </Text>

      <Text
        style={{
          fontSize: 13,
          color: theme.colors.muted,
          textTransform: 'uppercase',
          letterSpacing: 1,
        }}
      >
        Name
      </Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Your name"
        placeholderTextColor={theme.colors.muted}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          fontSize: 16,
          color: theme.colors.text,
          marginTop: 6,
        }}
      />

      <Text
        style={{
          fontSize: 13,
          color: theme.colors.muted,
          textTransform: 'uppercase',
          letterSpacing: 1,
          marginTop: theme.spacing.lg,
        }}
      >
        Email (optional)
      </Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        autoCapitalize="none"
        keyboardType="email-address"
        placeholderTextColor={theme.colors.muted}
        style={{
          borderWidth: 1,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.md,
          padding: theme.spacing.md,
          fontSize: 16,
          color: theme.colors.text,
          marginTop: 6,
        }}
      />

      <TouchableOpacity
        onPress={save}
        disabled={saving}
        style={{
          backgroundColor: theme.colors.primary,
          paddingVertical: theme.spacing.lg,
          borderRadius: theme.radius.md,
          marginTop: theme.spacing.xl,
          opacity: saving ? 0.6 : 1,
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
          {saving ? 'Saving...' : 'Save'}
        </Text>
      </TouchableOpacity>

      <TouchableOpacity onPress={signOut} style={{ marginTop: theme.spacing.xl }}>
        <Text
          style={{
            color: theme.colors.danger,
            textAlign: 'center',
            fontSize: 15,
            fontWeight: '600',
          }}
        >
          Sign out
        </Text>
      </TouchableOpacity>
    </View>
  );
}
