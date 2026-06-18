import { useState } from 'react';
import {
  LayoutAnimation,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';

// 안드로이드에서 LayoutAnimation 활성화 (web/iOS는 기본 동작)
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

/**
 * 공용 접기 섹션 — 종목 상세 정보과잉 정리용.
 * 닫혀 있을 땐 제목 + 우측 한 줄 요약(summary)만 보이고, 탭하면 children 펼침.
 *
 * props:
 *  - title:      섹션 제목 (필수)
 *  - summary:    접힘 상태에서 우측에 보일 한 줄 요약 (선택)
 *  - icon:       제목 앞 이모지/아이콘 (선택)
 *  - defaultOpen: 처음에 펼친 상태로 둘지 (기본 false)
 *  - children:   펼쳤을 때 보일 내용
 */
export default function CollapsibleSection({ title, summary, icon, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);

  const toggle = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setOpen((v) => !v);
  };

  return (
    <View style={styles.wrap}>
      <TouchableOpacity style={styles.header} onPress={toggle} activeOpacity={0.7}>
        <View style={styles.titleRow}>
          {icon ? <Text style={styles.icon}>{icon}</Text> : null}
          <Text style={styles.title}>{title}</Text>
        </View>
        <View style={styles.rightRow}>
          {!open && summary ? (
            <Text style={styles.summary} numberOfLines={1}>{summary}</Text>
          ) : null}
          <Text style={[styles.chevron, open && styles.chevronOpen]}>⌄</Text>
        </View>
      </TouchableOpacity>

      {open ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    backgroundColor: '#161B35',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#252A47',
    marginHorizontal: 15,
    marginVertical: 6,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexShrink: 0 },
  icon: { fontSize: 15, marginRight: 7 },
  title: { fontSize: 15, fontWeight: '700', color: '#FFFFFF' },
  rightRow: { flexDirection: 'row', alignItems: 'center', flex: 1, justifyContent: 'flex-end', marginLeft: 10 },
  summary: { fontSize: 12, color: '#8892A4', marginRight: 8, flexShrink: 1, textAlign: 'right' },
  chevron: { fontSize: 18, color: '#6B7280', fontWeight: '700', marginTop: -4 },
  chevronOpen: { transform: [{ rotate: '180deg' }], marginTop: 0 },
  body: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    paddingTop: 2,
  },
});
