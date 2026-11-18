import { useCallback, useEffect, useMemo, useState } from 'react'
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native'
import { Activity, ArrowDownRight, ChevronDown, ChevronRight, Clock3, Copy, Crown, History, LogOut, Menu, Plus, Power, ShieldAlert, Users, X } from 'lucide-react-native'
import { elapsedSeconds, formatDuration } from '../lib/descreen-config'
import { supabase } from '../lib/supabase'

type Props = { userId: string; email?: string; onSignOut: () => void }
type Tab = 'home' | 'groups' | 'leaderboard' | 'history'
type Profile = { username: string }
type Group = { id: string; name: string; invite_code: string }
type Session = { id: string; user_id: string; group_id: string | null; started_at: string; ended_at: string | null; status: string; current_streak_seconds: number; longest_streak_seconds: number; total_recreational_seconds: number; monitoring_status: string }
type LeaderRow = Session & { username: string }
const C = { green: '#c5f36a', bg: '#080a08', panel: '#10130f', panel2: '#151914', edge: '#272d25', white: '#f2f4ed', muted: '#90968b', faint: '#62695f', red: '#ff8178', amber: '#f1bd63' }

export function DescreenApp({ userId, email, onSignOut }: Props) {
  const [tab, setTab] = useState<Tab>('home')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [groups, setGroups] = useState<Group[]>([])
  const [session, setSession] = useState<Session | null>(null)
  const [history, setHistory] = useState<Session[]>([])
  const [leaderboard, setLeaderboard] = useState<LeaderRow[]>([])
  const [tick, setTick] = useState(Date.now())
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [modal, setModal] = useState<'create' | 'join' | null>(null)
  const [groupInput, setGroupInput] = useState('')
  const [inviteInput, setInviteInput] = useState('')
  const [message, setMessage] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)

  const refresh = useCallback(async () => {
    if (!supabase) return
    const [profileResult, groupsResult, activeResult, historyResult] = await Promise.all([
      supabase.from('users').select('username').eq('id', userId).maybeSingle(),
      supabase.from('group_members').select('group_id, groups(id,name,invite_code)').eq('user_id', userId),
      supabase.from('sessions').select('id,user_id,group_id,started_at,ended_at,status,current_streak_seconds,longest_streak_seconds,total_recreational_seconds,monitoring_status').eq('user_id', userId).is('ended_at', null).maybeSingle(),
      supabase.from('sessions').select('id,user_id,group_id,started_at,ended_at,status,current_streak_seconds,longest_streak_seconds,total_recreational_seconds,monitoring_status').eq('user_id', userId).not('ended_at', 'is', null).order('ended_at', { ascending: false }).limit(12),
    ])
    if (profileResult.data) setProfile(profileResult.data as Profile)
    if (groupsResult.data) setGroups(groupsResult.data.map((row: any) => row.groups).filter(Boolean) as Group[])
    setSession(activeResult.data as Session | null)
    if (historyResult.data) setHistory(historyResult.data as Session[])
    setLoading(false)
  }, [userId])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (!session) return
    const timer = setInterval(() => setTick(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [session])
  useEffect(() => {
    if (!supabase || groups.length === 0) return
    const channel = supabase.channel('descreen-group-sessions').on('postgres_changes', { event: '*', schema: 'public', table: 'sessions' }, () => { void refresh() }).subscribe()
    return () => { void supabase?.removeChannel(channel) }
  }, [groups.length, refresh])
  useEffect(() => {
    const client = supabase
    const groupId = groups[0]?.id
    if (!client || !groupId) { setLeaderboard([]); return }
    let active = true
    const loadLeaderboard = async () => {
      const { data } = await client.from('sessions').select('id,user_id,group_id,started_at,ended_at,status,current_streak_seconds,longest_streak_seconds,total_recreational_seconds,monitoring_status,users(username)').eq('group_id', groupId).order('longest_streak_seconds', { ascending: false }).limit(20)
      if (active && data) setLeaderboard(data.map((row: any) => ({ ...row, username: row.users?.username ?? 'member' })) as LeaderRow[])
    }
    void loadLeaderboard()
    const channel = client.channel(`descreen-leaderboard-${groupId}`).on('postgres_changes', { event: '*', schema: 'public', table: 'sessions', filter: `group_id=eq.${groupId}` }, () => { void loadLeaderboard() }).subscribe()
    return () => { active = false; void client.removeChannel(channel) }
  }, [groups])

  const displayName = profile?.username || email?.split('@')[0] || 'friend'
  const currentSeconds = session ? elapsedSeconds(session.started_at, tick) : 0
  const isActive = Boolean(session && !session.ended_at && !['INTERRUPTED', 'COMPLETED'].includes(session.status))
  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    return hour < 12 ? 'A little more morning.' : hour < 18 ? 'Take back your afternoon.' : 'The night is yours.'
  }, [])

  async function startSession() {
    if (!supabase || busy) return
    setBusy(true); setMessage('')
    const { data, error } = await supabase.rpc('start_descreen_session', { p_group_id: groups[0]?.id ?? null })
    setBusy(false)
    if (error) { setMessage(error.code === '23505' ? 'You already have an open session. Refreshing it now.' : 'Could not start your session. Please try again.'); await refresh(); return }
    setSession(data as Session)
  }

  async function endSession(status: 'COMPLETED' | 'INTERRUPTED' = 'COMPLETED') {
    if (!supabase || !session || busy) return
    setBusy(true)
    const { error } = await supabase.rpc('finish_descreen_session', { p_session_id: session.id, p_status: status })
    setBusy(false)
    if (error) { setMessage('Could not save this session. Please try again.'); return }
    setSession(null)
    await refresh()
  }

  async function submitGroup() {
    if (!supabase || busy) return
    setBusy(true); setMessage('')
    const { error } = modal === 'create'
      ? await supabase.rpc('create_descreen_group', { p_name: groupInput.trim() })
      : await supabase.rpc('join_descreen_group', { p_invite_code: inviteInput.trim() })
    setBusy(false)
    if (error) { setMessage(error.message.includes('Invite code') ? 'That invite code could not be found.' : 'Could not update your groups. Check the details and try again.'); return }
    setModal(null); setGroupInput(''); setInviteInput(''); await refresh()
  }

  function nav(next: Tab) { setTab(next); setMenuOpen(false); setMessage('') }

  return (
    <View style={styles.root}>
      <View pointerEvents="none" style={styles.ambientTop} />
      <View style={styles.frame}>
        <View style={styles.topbar}>
          <Pressable style={styles.brandWrap} onPress={() => nav('home')} accessibilityRole="button" accessibilityLabel="Descreen home">
            <View style={styles.brandGlyph}><Activity size={15} color={C.green} /></View>
            <Text style={styles.wordmark}>DESCREEN</Text>
          </Pressable>
          <View style={styles.topRight}>
            <View style={styles.onlineDot} /><Text style={styles.topStatus}>PRIVATE SESSION</Text>
            <Pressable onPress={() => setMenuOpen(!menuOpen)} style={styles.menuButton} accessibilityRole="button" accessibilityLabel="Open account menu"><Menu size={18} color={C.muted} /></Pressable>
          </View>
        </View>
        {menuOpen && <View style={styles.accountMenu}><Text style={styles.accountName}>@{displayName}</Text><Text style={styles.accountEmail}>{email}</Text><Pressable style={styles.logout} onPress={onSignOut}><LogOut size={14} color={C.red} /><Text style={styles.logoutText}>Sign out</Text></Pressable></View>}
        <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
          {tab === 'home' && <HomeView greeting={greeting} displayName={displayName} session={session} active={isActive} currentSeconds={currentSeconds} busy={busy || loading} group={groups[0]} onStart={startSession} onEnd={() => void endSession()} onOpenGroups={() => nav('groups')} onOpenBoard={() => nav('leaderboard')} />}
          {tab === 'groups' && <GroupsView groups={groups} onCreate={() => setModal('create')} onJoin={() => setModal('join')} />}
          {tab === 'leaderboard' && <LeaderboardView rows={leaderboard} group={groups[0]} ownId={userId} />}
          {tab === 'history' && <HistoryView sessions={history} />}
          {!!message && <Text style={styles.message} accessibilityRole="alert">{message}</Text>}
          <View style={styles.footerNote}><ShieldAlert size={12} color="#72796d" /><Text style={styles.footerText}>Tracking is unverified until Android Usage Access is enabled.</Text></View>
        </ScrollView>
        <View style={styles.tabbar}>
          <TabItem icon="home" label="OFFLINE" selected={tab === 'home'} onPress={() => nav('home')} />
          <TabItem icon="groups" label="SQUAD" selected={tab === 'groups'} onPress={() => nav('groups')} badge={groups.length} />
          <TabItem icon="board" label="RANK" selected={tab === 'leaderboard'} onPress={() => nav('leaderboard')} />
          <TabItem icon="history" label="LOG" selected={tab === 'history'} onPress={() => nav('history')} />
        </View>
      </View>
      {modal && <GroupModal mode={modal} value={modal === 'create' ? groupInput : inviteInput} onChange={modal === 'create' ? setGroupInput : setInviteInput} onClose={() => setModal(null)} onSubmit={() => void submitGroup()} busy={busy} />}
    </View>
  )
}

function HomeView({ greeting, displayName, session, active, currentSeconds, busy, group, onStart, onEnd, onOpenGroups, onOpenBoard }: { greeting: string; displayName: string; session: Session | null; active: boolean; currentSeconds: number; busy: boolean; group?: Group; onStart: () => void; onEnd: () => void; onOpenGroups: () => void; onOpenBoard: () => void }) {
  return <View style={styles.home}>
    <View style={styles.greetingRow}><View><Text style={styles.greeting}>{greeting}</Text><Text style={styles.hello}>Hey, <Text style={styles.helloName}>{displayName}</Text></Text></View><View style={styles.avatar}><Text style={styles.avatarText}>{displayName.slice(0, 1).toUpperCase()}</Text></View></View>
    <View style={styles.challengeRow}><View style={styles.challengeDot} /><Text style={styles.challengeLabel}>{group ? `${group.name.toUpperCase()} CHALLENGE` : 'YOUR PERSONAL CHALLENGE'}</Text><ChevronDown size={13} color={C.faint} /></View>
    <View style={styles.timerBlock}>
      <Text style={styles.timerLabel}>{active ? 'TIME AWAY' : session?.status === 'INTERRUPTED' ? 'STREAK INTERRUPTED' : 'READY WHEN YOU ARE'}</Text>
      <Text style={[styles.timer, active && styles.timerActive]}>{formatDuration(active ? currentSeconds : 0)}</Text>
      <View style={styles.sessionMeta}><View style={[styles.statusPill, active && styles.statusPillActive]}><View style={[styles.statusDot, active && styles.statusDotActive]} /><Text style={[styles.statusText, active && styles.statusTextActive]}>{active ? 'SESSION IN PROGRESS' : 'NOT TRACKING'}</Text></View></View>
    </View>
    <View style={styles.buttonWrap}>
      <View pointerEvents="none" style={styles.outerGlow} />
      <Pressable accessibilityRole="button" accessibilityLabel={active ? 'End Descreen session' : 'Start Descreen session'} disabled={busy} onPress={active ? onEnd : onStart} style={({ pressed }) => [styles.powerButton, active && styles.powerButtonActive, pressed && styles.powerPressed]}>
        <View style={styles.powerInner}><Power size={40} color={active ? '#d5ff8b' : C.green} strokeWidth={1.7} /></View>
      </Pressable>
      <Text style={styles.powerCaption}>{busy ? 'ONE MOMENT' : active ? 'END SESSION' : 'GO OFFLINE'}</Text>
      <Text style={styles.powerHint}>{active ? 'You are showing up for yourself.' : 'One press. Then put it away.'}</Text>
    </View>
    {active && <View style={styles.activeCallout}><ShieldAlert size={15} color={C.amber} /><Text style={styles.activeCalloutText}>Timer saved. Usage verification is currently unavailable on this device.</Text></View>}
    <View style={styles.ruleCard}><View style={styles.ruleIcon}><Clock3 size={16} color={C.green} /></View><View style={styles.ruleCopy}><Text style={styles.ruleTitle}>A quick check is okay.</Text><Text style={styles.ruleDescription}>Under 10 seconds is a glance. At 120 seconds, the streak breaks.</Text></View><ChevronRight size={15} color={C.faint} /></View>
    <View style={styles.statsRow}>
      <Pressable style={styles.statCard} onPress={onOpenGroups}><View style={styles.statHeading}><Users size={14} color={C.green} /><Text style={styles.statLabel}>YOUR SQUAD</Text></View><Text style={styles.statValue}>{group?.name ?? 'Find your people'}</Text><Text style={styles.statFoot}>{group ? 'View group' : 'Create or join a group'}</Text></Pressable>
      <Pressable style={styles.statCard} onPress={onOpenBoard}><View style={styles.statHeading}><Crown size={14} color={C.amber} /><Text style={styles.statLabel}>PERSONAL BEST</Text></View><Text style={styles.statValue}>{formatDuration(session?.longest_streak_seconds ?? 0)}</Text><Text style={styles.statFoot}>Longest verified streak</Text></Pressable>
    </View>
  </View>
}

function GroupsView({ groups, onCreate, onJoin }: { groups: Group[]; onCreate: () => void; onJoin: () => void }) {
  return <View style={styles.subpage}><View style={styles.pageEyebrow}><Users size={14} color={C.green} /><Text style={styles.pageEyebrowText}>YOUR PEOPLE</Text></View><Text style={styles.pageTitle}>Squads</Text><Text style={styles.pageIntro}>Stay accountable together. Your group updates as everyone checks in.</Text>
    <View style={styles.actionRow}><Pressable style={styles.primarySmall} onPress={onCreate}><Plus size={15} color="#111" /><Text style={styles.primarySmallText}>Create group</Text></Pressable><Pressable style={styles.secondarySmall} onPress={onJoin}><Text style={styles.secondarySmallText}>Join with code</Text></Pressable></View>
    {groups.length === 0 ? <View style={styles.emptyCard}><View style={styles.emptyIcon}><Users size={19} color={C.green} /></View><Text style={styles.emptyTitle}>Better together.</Text><Text style={styles.emptyBody}>Create a private squad or join one with an invite code. Your challenge leaderboard lives here.</Text></View> : groups.map((group) => <View key={group.id} style={styles.groupCard}><View style={styles.groupAvatar}><Users size={17} color={C.green} /></View><View style={styles.groupCopy}><Text style={styles.groupName}>{group.name}</Text><Text style={styles.groupMeta}>INVITE CODE  ·  {group.invite_code}</Text></View><Copy size={15} color={C.faint} /></View>)}
  </View>
}

function LeaderboardView({ rows, group, ownId }: { rows: LeaderRow[]; group?: Group; ownId: string }) {
  return <View style={styles.subpage}><View style={styles.pageEyebrow}><Crown size={14} color={C.amber} /><Text style={styles.pageEyebrowText}>THE LONG GAME</Text></View><Text style={styles.pageTitle}>Leaderboard</Text><Text style={styles.pageIntro}>{group ? `${group.name} · ranked by longest qualifying streak` : 'Join a squad to see how your friends are doing.'}</Text>
    {rows.length === 0 ? <View style={styles.emptyCard}><View style={styles.emptyIcon}><Crown size={19} color={C.amber} /></View><Text style={styles.emptyTitle}>The board is clear.</Text><Text style={styles.emptyBody}>Start a session with your squad. Verified streaks will appear here as people put their phones down.</Text></View> : <View style={styles.leaderCard}>{rows.map((row, index) => <View key={row.id} style={[styles.leaderRow, index === rows.length - 1 && { borderBottomWidth: 0 }]}><Text style={[styles.rank, index === 0 && { color: C.amber }]}>{String(index + 1).padStart(2, '0')}</Text><View style={styles.leaderAvatar}><Text style={styles.leaderAvatarText}>{row.username.slice(0, 1).toUpperCase()}</Text></View><View style={styles.leaderCopy}><Text style={styles.leaderName}>{row.username}{row.user_id === ownId ? '  YOU' : ''}</Text><Text style={styles.leaderStatus}>{row.status === 'UNVERIFIED' ? 'UNVERIFIED' : row.ended_at ? 'RESTING' : 'OFFLINE NOW'}</Text></View><Text style={styles.leaderScore}>{formatDuration(row.longest_streak_seconds)}</Text></View>)}</View>}
    <View style={styles.scoreNote}><Text style={styles.scoreNoteTitle}>HOW SCORING WORKS</Text><Text style={styles.scoreNoteBody}>Longest qualifying streak ranks first. Recreational time breaks ties. Unverified time is never shown as verified.</Text></View>
  </View>
}

function HistoryView({ sessions }: { sessions: Session[] }) {
  return <View style={styles.subpage}><View style={styles.pageEyebrow}><History size={14} color={C.green} /><Text style={styles.pageEyebrowText}>LOOK BACK</Text></View><Text style={styles.pageTitle}>Session log</Text><Text style={styles.pageIntro}>Every time you chose to be present counts.</Text>
    {sessions.length === 0 ? <View style={styles.emptyCard}><View style={styles.emptyIcon}><History size={19} color={C.green} /></View><Text style={styles.emptyTitle}>Your story starts here.</Text><Text style={styles.emptyBody}>Completed sessions and your best moments will find their place in this log.</Text></View> : sessions.map((item) => <View key={item.id} style={styles.historyCard}><View style={styles.historyTop}><View style={[styles.historyState, item.status === 'INTERRUPTED' && styles.historyStateBroken]}><Text style={[styles.historyStateText, item.status === 'INTERRUPTED' && { color: C.red }]}>{item.status === 'INTERRUPTED' ? 'INTERRUPTED' : 'COMPLETED'}</Text></View><Text style={styles.historyDate}>{new Date(item.started_at).toLocaleDateString()}</Text></View><View style={styles.historyBottom}><View><Text style={styles.historyMetricLabel}>LONGEST STREAK</Text><Text style={styles.historyMetric}>{formatDuration(item.longest_streak_seconds)}</Text></View><View style={styles.historyMetricDivider} /><View><Text style={styles.historyMetricLabel}>RECREATIONAL</Text><Text style={styles.historyMetric}>{formatDuration(item.total_recreational_seconds)}</Text></View></View></View>)}
  </View>
}

function GroupModal({ mode, value, onChange, onClose, onSubmit, busy }: { mode: 'create' | 'join'; value: string; onChange: (value: string) => void; onClose: () => void; onSubmit: () => void; busy: boolean }) {
  return <View style={styles.modalBackdrop}><View style={styles.modalCard}><View style={styles.modalTop}><Text style={styles.modalTitle}>{mode === 'create' ? 'Start a squad' : 'Join a squad'}</Text><Pressable onPress={onClose} accessibilityRole="button" accessibilityLabel="Close"><X size={19} color={C.muted} /></Pressable></View><Text style={styles.modalIntro}>{mode === 'create' ? 'Give your group a name. You can invite your people with the code.' : 'Enter the invite code shared by your friend.'}</Text><TextInput value={value} onChangeText={onChange} placeholder={mode === 'create' ? 'Sunday reset club' : '6 character invite code'} placeholderTextColor={C.faint} autoCapitalize={mode === 'join' ? 'characters' : 'words'} style={styles.modalInput} />{mode === 'create' && <Text style={styles.modalHint}>Invite codes are generated automatically and can be shared from your group.</Text>}<Pressable disabled={busy || !value.trim()} onPress={onSubmit} style={[styles.submitModal, (busy || !value.trim()) && { opacity: 0.45 }]}>{busy ? <ActivityIndicator color="#111" /> : <><Text style={styles.submitModalText}>{mode === 'create' ? 'Create squad' : 'Join squad'}</Text><ArrowDownRight size={15} color="#10130d" /></>}</Pressable></View></View>
}

function TabItem({ icon, label, selected, onPress, badge }: { icon: 'home' | 'groups' | 'board' | 'history'; label: string; selected: boolean; onPress: () => void; badge?: number }) {
  const Icon = icon === 'home' ? Power : icon === 'groups' ? Users : icon === 'board' ? Crown : History
  return <Pressable onPress={onPress} accessibilityRole="tab" accessibilityState={{ selected }} style={styles.tabItem}><View style={[styles.tabIcon, selected && styles.tabIconSelected]}><Icon size={17} color={selected ? C.green : C.faint} />{Boolean(badge) && <View style={styles.tabBadge} />}</View><Text style={[styles.tabLabel, selected && styles.tabLabelSelected]}>{label}</Text></Pressable>
}

const styles = StyleSheet.create({
  root: { flex: 1, minHeight: '100%', backgroundColor: C.bg, alignItems: 'center', overflow: 'hidden' },
  ambientTop: { position: 'absolute', width: 450, height: 450, borderRadius: 260, backgroundColor: '#182316', opacity: 0.28, top: -380, left: '50%', transform: [{ translateX: -225 }] },
  frame: { flex: 1, width: '100%', maxWidth: 480, borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#171b16', backgroundColor: C.bg },
  topbar: { height: 61, borderBottomWidth: 1, borderBottomColor: '#1d221b', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 22 },
  brandWrap: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brandGlyph: { width: 28, height: 28, borderRadius: 9, borderWidth: 1, borderColor: '#37412e', backgroundColor: '#141a11', alignItems: 'center', justifyContent: 'center' }, wordmark: { color: C.white, fontSize: 12, fontWeight: '800', letterSpacing: 2 }, topRight: { flexDirection: 'row', alignItems: 'center', gap: 7 }, onlineDot: { width: 5, height: 5, backgroundColor: C.green, borderRadius: 4 }, topStatus: { color: '#7a8175', letterSpacing: 1.2, fontSize: 8, fontWeight: '700' }, menuButton: { width: 32, height: 32, borderRadius: 10, borderWidth: 1, borderColor: C.edge, alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  accountMenu: { position: 'absolute', zIndex: 3, top: 53, right: 14, width: 205, padding: 15, borderRadius: 14, backgroundColor: '#161a14', borderWidth: 1, borderColor: C.edge }, accountName: { color: C.white, fontSize: 12, fontWeight: '700' }, accountEmail: { color: C.muted, fontSize: 10, marginTop: 3 }, logout: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingTop: 12, marginTop: 12, borderTopWidth: 1, borderTopColor: C.edge }, logoutText: { color: C.red, fontSize: 11, fontWeight: '700' },
  scroll: { paddingHorizontal: 22, paddingBottom: 25 }, home: { paddingTop: 23 }, greetingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }, greeting: { color: C.muted, fontSize: 11 }, hello: { color: C.white, fontSize: 24, fontWeight: '500', letterSpacing: -0.6, marginTop: 3 }, helloName: { color: C.green, fontWeight: '700' }, avatar: { width: 37, height: 37, borderRadius: 14, backgroundColor: '#1a2017', borderWidth: 1, borderColor: '#38422f', alignItems: 'center', justifyContent: 'center' }, avatarText: { color: C.green, fontSize: 13, fontWeight: '800' },
  challengeRow: { marginTop: 24, alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#121610', borderWidth: 1, borderColor: '#242a21', paddingHorizontal: 11, height: 30, borderRadius: 20 }, challengeDot: { width: 5, height: 5, borderRadius: 4, backgroundColor: C.green }, challengeLabel: { color: '#a7afa0', fontSize: 8, letterSpacing: 1.25, fontWeight: '700' },
  timerBlock: { alignItems: 'center', marginTop: 29 }, timerLabel: { color: '#8a9184', fontSize: 9, fontWeight: '700', letterSpacing: 2 }, timer: { color: '#f3f5ee', fontSize: 51, fontWeight: '300', fontVariant: ['tabular-nums'], letterSpacing: -2.4, marginTop: 7 }, timerActive: { color: C.green }, sessionMeta: { flexDirection: 'row', marginTop: 10 }, statusPill: { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: '#141713', borderRadius: 15, paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#292e27' }, statusPillActive: { backgroundColor: '#151b11', borderColor: '#38452e' }, statusDot: { width: 5, height: 5, borderRadius: 4, backgroundColor: '#686f65' }, statusDotActive: { backgroundColor: C.green }, statusText: { color: '#8b9187', letterSpacing: 1, fontSize: 8, fontWeight: '700' }, statusTextActive: { color: C.green },
  buttonWrap: { alignItems: 'center', marginTop: 19 }, outerGlow: { position: 'absolute', width: 210, height: 210, borderRadius: 120, backgroundColor: '#a7ee4e', opacity: 0.035, top: -3 }, powerButton: { width: 164, height: 164, borderRadius: 100, borderWidth: 1, borderColor: '#719043', backgroundColor: '#151b11', alignItems: 'center', justifyContent: 'center', shadowColor: '#a4ec47', shadowOpacity: 0.18, shadowRadius: 29, shadowOffset: { width: 0, height: 0 }, elevation: 8 }, powerButtonActive: { backgroundColor: '#1b2513', borderColor: C.green, shadowOpacity: 0.32 }, powerInner: { width: 140, height: 140, borderRadius: 80, borderWidth: 1, borderColor: '#343f2b', backgroundColor: '#10140e', alignItems: 'center', justifyContent: 'center' }, powerPressed: { transform: [{ scale: 0.96 }], opacity: 0.85 }, powerCaption: { color: C.green, fontSize: 10, fontWeight: '800', letterSpacing: 2.1, marginTop: 14 }, powerHint: { color: '#81877d', fontSize: 10, marginTop: 5 },
  activeCallout: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, backgroundColor: '#211b10', borderWidth: 1, borderColor: '#514129', borderRadius: 12, padding: 11, marginTop: 15 }, activeCalloutText: { color: '#e5c68f', fontSize: 10, lineHeight: 16, flex: 1 },
  ruleCard: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: C.edge, backgroundColor: C.panel, borderRadius: 14, padding: 12, marginTop: 18 }, ruleIcon: { width: 31, height: 31, borderRadius: 10, backgroundColor: '#192016', alignItems: 'center', justifyContent: 'center' }, ruleCopy: { flex: 1 }, ruleTitle: { color: C.white, fontSize: 10, fontWeight: '700' }, ruleDescription: { color: C.muted, fontSize: 9, lineHeight: 14, marginTop: 3 },
  statsRow: { flexDirection: 'row', gap: 10, marginTop: 10 }, statCard: { flex: 1, borderWidth: 1, borderColor: C.edge, borderRadius: 14, backgroundColor: C.panel, padding: 12, minHeight: 91 }, statHeading: { flexDirection: 'row', alignItems: 'center', gap: 6 }, statLabel: { color: '#8c9386', fontSize: 8, letterSpacing: 1, fontWeight: '700' }, statValue: { color: C.white, fontSize: 13, fontWeight: '700', marginTop: 11 }, statFoot: { color: '#858c80', fontSize: 9, marginTop: 4 },
  footerNote: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 18, marginBottom: 2 }, footerText: { color: '#737a6f', fontSize: 9 }, message: { color: C.red, textAlign: 'center', fontSize: 11, lineHeight: 16, marginTop: 12 },
  tabbar: { height: 67, borderTopWidth: 1, borderTopColor: '#1c211a', backgroundColor: '#0c0f0c', flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 14 }, tabItem: { alignItems: 'center', justifyContent: 'center', width: 62, gap: 4 }, tabIcon: { width: 34, height: 26, alignItems: 'center', justifyContent: 'center', borderRadius: 9 }, tabIconSelected: { backgroundColor: '#1a2115' }, tabLabel: { color: '#686f64', fontSize: 7, fontWeight: '700', letterSpacing: 1 }, tabLabelSelected: { color: C.green }, tabBadge: { position: 'absolute', width: 4, height: 4, borderRadius: 3, backgroundColor: C.green, top: 2, right: 7 },
  subpage: { paddingTop: 34, minHeight: 560 }, pageEyebrow: { flexDirection: 'row', alignItems: 'center', gap: 7 }, pageEyebrowText: { color: C.green, fontSize: 9, fontWeight: '800', letterSpacing: 1.8 }, pageTitle: { color: C.white, fontSize: 32, fontWeight: '500', letterSpacing: -1, marginTop: 10 }, pageIntro: { color: C.muted, fontSize: 12, lineHeight: 19, marginTop: 7, maxWidth: 360 }, actionRow: { flexDirection: 'row', gap: 9, marginTop: 24 }, primarySmall: { height: 39, backgroundColor: C.green, borderRadius: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 12 }, primarySmallText: { color: '#10130d', fontSize: 10, fontWeight: '800' }, secondarySmall: { height: 39, borderWidth: 1, borderColor: '#394032', borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 13 }, secondarySmallText: { color: C.white, fontSize: 10, fontWeight: '700' },
  emptyCard: { borderRadius: 18, borderWidth: 1, borderColor: C.edge, backgroundColor: C.panel, padding: 22, alignItems: 'center', marginTop: 19 }, emptyIcon: { width: 44, height: 44, borderRadius: 15, backgroundColor: '#1a2115', alignItems: 'center', justifyContent: 'center' }, emptyTitle: { color: C.white, fontSize: 15, fontWeight: '700', marginTop: 14 }, emptyBody: { color: C.muted, fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 7, maxWidth: 290 }, groupCard: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: C.edge, backgroundColor: C.panel, borderRadius: 14, padding: 13, marginTop: 10 }, groupAvatar: { width: 38, height: 38, borderRadius: 12, backgroundColor: '#1a2115', alignItems: 'center', justifyContent: 'center' }, groupCopy: { flex: 1, marginLeft: 11 }, groupName: { color: C.white, fontSize: 12, fontWeight: '700' }, groupMeta: { color: C.muted, fontSize: 8, letterSpacing: 1, marginTop: 5 },
  leaderCard: { borderRadius: 16, borderWidth: 1, borderColor: C.edge, backgroundColor: C.panel, paddingHorizontal: 13, marginTop: 22 }, leaderRow: { flexDirection: 'row', alignItems: 'center', minHeight: 63, borderBottomWidth: 1, borderBottomColor: '#252a23' }, rank: { width: 27, color: '#858c80', fontSize: 11, fontWeight: '700' }, leaderAvatar: { width: 32, height: 32, borderRadius: 11, backgroundColor: '#20271b', alignItems: 'center', justifyContent: 'center' }, leaderAvatarText: { color: C.green, fontSize: 11, fontWeight: '800' }, leaderCopy: { flex: 1, marginLeft: 10 }, leaderName: { color: C.white, fontSize: 10, fontWeight: '700' }, leaderStatus: { color: '#858c80', fontSize: 7, letterSpacing: 1, marginTop: 4 }, leaderScore: { color: C.white, fontVariant: ['tabular-nums'], fontSize: 10, fontWeight: '700' }, scoreNote: { borderWidth: 1, borderColor: C.edge, backgroundColor: '#11140f', borderRadius: 13, padding: 14, marginTop: 14 }, scoreNoteTitle: { color: '#abb3a5', fontSize: 8, letterSpacing: 1.3, fontWeight: '800' }, scoreNoteBody: { color: C.muted, fontSize: 10, lineHeight: 16, marginTop: 6 },
  historyCard: { borderWidth: 1, borderColor: C.edge, backgroundColor: C.panel, borderRadius: 14, padding: 14, marginTop: 10 }, historyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, historyState: { borderRadius: 20, backgroundColor: '#192116', paddingHorizontal: 9, paddingVertical: 5 }, historyStateBroken: { backgroundColor: '#281713' }, historyStateText: { color: C.green, fontSize: 7, fontWeight: '800', letterSpacing: 1 }, historyDate: { color: C.muted, fontSize: 9 }, historyBottom: { flexDirection: 'row', marginTop: 14 }, historyMetricDivider: { width: 1, backgroundColor: C.edge, marginHorizontal: 20 }, historyMetricLabel: { color: C.faint, fontSize: 7, letterSpacing: 1, fontWeight: '700' }, historyMetric: { color: C.white, fontSize: 13, fontVariant: ['tabular-nums'], fontWeight: '700', marginTop: 5 },
  modalBackdrop: { ...StyleSheet.absoluteFill, zIndex: 5, backgroundColor: 'rgba(0,0,0,.72)', alignItems: 'center', justifyContent: 'center', padding: 20 }, modalCard: { width: '100%', maxWidth: 390, borderRadius: 20, borderWidth: 1, borderColor: '#373e33', backgroundColor: '#11140f', padding: 22 }, modalTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }, modalTitle: { color: C.white, fontSize: 19, fontWeight: '700' }, modalIntro: { color: C.muted, fontSize: 11, lineHeight: 17, marginTop: 7, marginBottom: 18 }, modalInput: { height: 47, borderRadius: 11, borderWidth: 1, borderColor: '#32382e', backgroundColor: '#0b0e0a', color: C.white, paddingHorizontal: 12, fontSize: 12 }, modalHint: { color: C.faint, fontSize: 9, lineHeight: 14, marginTop: 7 }, submitModal: { height: 45, borderRadius: 11, backgroundColor: C.green, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 18 }, submitModalText: { color: '#10130d', fontSize: 11, fontWeight: '800' },
})
