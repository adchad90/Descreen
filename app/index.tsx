import { useEffect, useState } from 'react'
import { ActivityIndicator, Text, View } from 'react-native'
import { AuthScreen } from '../components/auth-screen'
import { DescreenApp } from '../components/descreen-app'
import { supabase } from '../lib/supabase'

export default function Index() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null)
  const [loading, setLoading] = useState(Boolean(supabase))

  useEffect(() => {
    if (!supabase) return
    let mounted = true
    void supabase.auth.getSession().then(({ data }) => {
      if (mounted) { setUser(data.session?.user ? { id: data.session.user.id, email: data.session.user.email } : null); setLoading(false) }
    })
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ? { id: session.user.id, email: session.user.email } : null)
      setLoading(false)
    })
    return () => { mounted = false; subscription.unsubscribe() }
  }, [])

  if (loading) return <View style={{ flex: 1, backgroundColor: '#080a08', alignItems: 'center', justifyContent: 'center' }}><ActivityIndicator color="#c5f36a" /><Text style={{ color: '#90968b', fontSize: 11, marginTop: 12 }}>Finding your quiet...</Text></View>
  if (!user) return <AuthScreen configured={Boolean(supabase)} onAuthenticated={() => { void supabase?.auth.getUser().then(({ data }) => { if (data.user) setUser({ id: data.user.id, email: data.user.email }) }) }} />
  return <DescreenApp userId={user.id} email={user.email} onSignOut={() => { void supabase?.auth.signOut() }} />
}
