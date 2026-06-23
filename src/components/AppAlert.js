/**
 * 앱 자체 알림(Alert) — 웹에서 브라우저 기본 confirm/alert 대체.
 * 브라우저 기본 팝업은 "사이트 주소(min1107.github.io)"를 강제로 노출하므로,
 * 커스텀 모달로 바꿔 개인정보 노출 없이 깔끔하게 보여준다.
 *
 * 사용: App.js에서 web일 때 Alert.alert = showAppAlert 로 교체하고,
 *       루트에 <AppAlert /> 를 한 번 렌더한다.
 */
import { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';

let listener = null;

// RN Alert.alert(title, message, buttons) 시그니처 호환
export function showAppAlert(title, message, buttons) {
  const list = Array.isArray(buttons) && buttons.length ? buttons : [{ text: '확인' }];
  if (listener) listener({ title, message, buttons: list });
}

export default function AppAlert() {
  const [state, setState] = useState(null);

  useEffect(() => {
    listener = setState;
    return () => { listener = null; };
  }, []);

  if (!state) return null;
  const { title, message, buttons } = state;
  const close = () => setState(null);

  return (
    <Modal transparent visible animationType="fade" onRequestClose={close} statusBarTranslucent>
      <View style={s.overlay}>
        <View style={s.card}>
          {title ? <Text style={s.title}>{title}</Text> : null}
          {message ? <Text style={s.message}>{message}</Text> : null}
          <View style={[s.btnRow, buttons.length > 2 && s.btnCol]}>
            {buttons.map((b, i) => {
              const color = b.style === 'destructive' ? '#FF4466'
                : b.style === 'cancel' ? '#8A9BAE'
                : '#00D9FF';
              return (
                <TouchableOpacity
                  key={i}
                  style={s.btn}
                  onPress={() => { close(); setTimeout(() => b.onPress?.(), 0); }}
                  activeOpacity={0.7}
                >
                  <Text style={[s.btnText, { color }, b.style === 'cancel' && { fontWeight: '600' }]}>
                    {b.text || '확인'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center', alignItems: 'center', padding: 32,
  },
  card: {
    width: '100%', maxWidth: 340,
    backgroundColor: '#161B33', borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: '#2A3354',
  },
  title: { fontSize: 17, fontWeight: '800', color: '#FFFFFF', marginBottom: 8 },
  message: { fontSize: 14, color: '#C5CEE0', lineHeight: 21, marginBottom: 18 },
  btnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 6 },
  btnCol: { flexDirection: 'column', alignItems: 'stretch', gap: 2 },
  btn: { paddingVertical: 10, paddingHorizontal: 16, borderRadius: 10 },
  btnText: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
});
