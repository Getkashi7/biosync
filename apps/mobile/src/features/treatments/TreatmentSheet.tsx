/**
 * The bottom-sheet shell both §7 sheets sit in.
 *
 * Extracted because the request sheet and the decline sheet need identical
 * open/close choreography, and a second hand-rolled copy of the spring-and-scrim
 * dance is a place for them to drift apart. Behaviour matches `PhotoAddSheet`:
 * the sheet measures itself on first layout, then translates up from its own
 * height, so it never animates from a guessed offset.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { Keyboard, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { bio, fontFamily, motion } from "../../ui/theme";
import { keyboardOverlap } from "../../lib/keyboard";

export function TreatmentSheet({
  title,
  subtitle,
  onClose,
  children,
}: {
  title: string;
  subtitle: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  /**
   * The request sheet asks for a note, and a Modal gets no screen-level
   * keyboard handling — so the sheet lifts itself clear of the keyboard the
   * same way Ask's composer does. See `lib/keyboard`.
   */
  const [kbOverlap, setKbOverlap] = useState(0);
  const sheetP = useSharedValue(0);
  const scrimP = useSharedValue(0);
  const sheetH = useSharedValue(0);
  const opened = useRef(false);

  const close = useCallback(() => {
    scrimP.value = withTiming(0, { duration: motion.duration.sheetClose, easing: motion.easeOut });
    sheetP.value = withTiming(
      0,
      { duration: motion.duration.sheetClose, easing: motion.easeOut },
      (finished) => {
        if (finished) runOnJS(onClose)();
      },
    );
  }, [onClose, scrimP, sheetP]);

  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (e) =>
      setKbOverlap(keyboardOverlap(windowHeight, e.endCoordinates.screenY)),
    );
    const hide = Keyboard.addListener("keyboardDidHide", () => setKbOverlap(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, [windowHeight]);

  const onLayout = (h: number) => {
    sheetH.value = h;
    if (!opened.current && h > 0) {
      opened.current = true;
      sheetP.value = withTiming(1, { duration: motion.duration.sheetOpen, easing: motion.easeOut });
      scrimP.value = withTiming(1, { duration: motion.duration.sheetScrim, easing: motion.easeOut });
    }
  };

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - sheetP.value) * (sheetH.value || 520) }],
  }));
  const scrimStyle = useAnimatedStyle(() => ({ opacity: scrimP.value }));

  return (
    // A Modal, not an overlay inside the screen: the request sheet's screen sits
    // under the floating tab bar, which covered "Ask for a review". Back closes
    // the sheet rather than the screen behind it.
    <Modal
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={close}
    >
      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.scrim, scrimStyle]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={close} accessibilityLabel="Dismiss" />
        </Animated.View>

        <Animated.View
          style={[styles.sheet, { paddingBottom: (kbOverlap > 0 ? kbOverlap : insets.bottom) + 24 }, sheetStyle]}
          onLayout={(e) => onLayout(e.nativeEvent.layout.height)}
        >
          <View style={styles.grabber} />
          <ScrollView
            showsVerticalScrollIndicator={false}
            style={styles.scroll}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.title}>{title}</Text>
            <Text style={styles.subtitle}>{subtitle}</Text>
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: { backgroundColor: "rgba(7,7,12,0.74)" },
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: "88%",
    borderTopLeftRadius: bio.radius.sheet,
    borderTopRightRadius: bio.radius.sheet,
    backgroundColor: "#14131C",
    borderTopWidth: 1,
    borderTopColor: bio.alpha(0.14),
    paddingTop: 12,
    paddingHorizontal: 20,
  },
  scroll: { flexGrow: 0 },
  grabber: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: bio.alpha(0.22),
    alignSelf: "center",
  },
  title: {
    fontFamily: fontFamily.bold,
    fontSize: 18,
    letterSpacing: -0.18,
    color: bio.color.text,
    marginTop: 16,
  },
  subtitle: { fontFamily: fontFamily.light, fontSize: 12, color: bio.alpha(0.55), marginTop: 4 },
});
