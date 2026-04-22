#!/usr/bin/env python3
"""Emit safari/NunusSafari.xcodeproj/project.pbxproj with valid 24-hex IDs."""
import os

I = [f"{i:024X}" for i in range(1, 200)]


def idx(n):
    return I[n - 1]


(
    P_ROOT,
    G_MAIN,
    G_SHARED,
    G_HOST,
    G_EXT,
    G_IOS,
    G_SCRIPTS,
    G_PROD,
    FR_SWIFT_APP,
    FR_HANDLER,
    FR_INFO,
    FR_HOST_ENT,
    FR_EXT_ENT,
    FR_SCRIPT,
    FR_IOS_HOST_ENT,
    FR_IOS_EXT_ENT,
    PR_HOST_APP,
    PR_EXT_APPEX,
    PR_HOST_IOS,
    PR_EXT_IOS,
    BF_APP_MAC,
    BF_HANDLER_MAC,
    BF_EMBED_MAC,
    BF_APP_IOS,
    BF_HANDLER_IOS,
    BF_EMBED_IOS,
    CP_MAC,
    CP_IOS,
    PX_MAC,
    PX_IOS,
    TD_MAC,
    TD_IOS,
    SH_MAC,
    SH_IOS,
    SRC_HOST_MAC,
    SRC_EXT_MAC,
    SRC_HOST_IOS,
    SRC_EXT_IOS,
    FW_MAC_H,
    FW_MAC_E,
    FW_IOS_H,
    FW_IOS_E,
    T_HOST_MAC,
    T_EXT_MAC,
    T_HOST_IOS,
    T_EXT_IOS,
    XC_PROJ,
    XC_HMAC,
    XC_EMAC,
    XC_HIOS,
    XC_EIOS,
    DBG_PROJ,
    REL_PROJ,
    DBG_HMAC,
    REL_HMAC,
    DBG_EMAC,
    REL_EMAC,
    DBG_HIOS,
    REL_HIOS,
    DBG_EIOS,
    REL_EIOS,
    FR_ASSETS,
    FR_APPICNS,
    BF_APPICNS_MAC,
    RS_MAC,
) = [idx(i) for i in range(1, 66)]

out_path = os.path.join(os.path.dirname(__file__), "..", "NunusSafari.xcodeproj", "project.pbxproj")

s = f"""// !$*UTF8*$!
{{
\tarchiveVersion = 1;
\tclasses = {{
\t}};
\tobjectVersion = 56;
\tobjects = {{

/* Begin PBXBuildFile section */
\t\t{BF_APP_MAC} /* NunusHostApp.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {FR_SWIFT_APP} /* NunusHostApp.swift */; }};
\t\t{BF_HANDLER_MAC} /* SafariWebExtensionHandler.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {FR_HANDLER} /* SafariWebExtensionHandler.swift */; }};
\t\t{BF_EMBED_MAC} /* NunusExtension.appex in Embed Foundation Extensions */ = {{isa = PBXBuildFile; fileRef = {PR_EXT_APPEX} /* NunusExtension.appex */; settings = {{ATTRIBUTES = (RemoveHeadersOnCopy, ); }}; }};
\t\t{BF_APPICNS_MAC} /* AppIcon.icns in Resources */ = {{isa = PBXBuildFile; fileRef = {FR_APPICNS} /* AppIcon.icns */; }};
\t\t{BF_APP_IOS} /* NunusHostApp.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {FR_SWIFT_APP} /* NunusHostApp.swift */; }};
\t\t{BF_HANDLER_IOS} /* SafariWebExtensionHandler.swift in Sources */ = {{isa = PBXBuildFile; fileRef = {FR_HANDLER} /* SafariWebExtensionHandler.swift */; }};
\t\t{BF_EMBED_IOS} /* NunusExtensioniOS.appex in Embed Foundation Extensions */ = {{isa = PBXBuildFile; fileRef = {PR_EXT_IOS} /* NunusExtensioniOS.appex */; settings = {{ATTRIBUTES = (RemoveHeadersOnCopy, ); }}; }};
/* End PBXBuildFile section */

/* Begin PBXContainerItemProxy section */
\t\t{PX_MAC} /* PBXContainerItemProxy */ = {{
\t\t\tisa = PBXContainerItemProxy;
\t\t\tcontainerPortal = {P_ROOT} /* Project object */;
\t\t\tproxyType = 1;
\t\t\tremoteGlobalIDString = {T_EXT_MAC};
\t\t\tremoteInfo = NunusExtension;
\t\t}};
\t\t{PX_IOS} /* PBXContainerItemProxy */ = {{
\t\t\tisa = PBXContainerItemProxy;
\t\t\tcontainerPortal = {P_ROOT} /* Project object */;
\t\t\tproxyType = 1;
\t\t\tremoteGlobalIDString = {T_EXT_IOS};
\t\t\tremoteInfo = NunusExtensioniOS;
\t\t}};
/* End PBXContainerItemProxy section */

/* Begin PBXCopyFilesBuildPhase section */
\t\t{CP_MAC} /* Embed Foundation Extensions */ = {{
\t\t\tisa = PBXCopyFilesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tdstPath = "";
\t\t\tdstSubfolderSpec = 13;
\t\t\tfiles = (
\t\t\t\t{BF_EMBED_MAC} /* NunusExtension.appex in Embed Foundation Extensions */,
\t\t\t);
\t\t\tname = "Embed Foundation Extensions";
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{CP_IOS} /* Embed Foundation Extensions */ = {{
\t\t\tisa = PBXCopyFilesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tdstPath = "";
\t\t\tdstSubfolderSpec = 13;
\t\t\tfiles = (
\t\t\t\t{BF_EMBED_IOS} /* NunusExtensioniOS.appex in Embed Foundation Extensions */,
\t\t\t);
\t\t\tname = "Embed Foundation Extensions";
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
/* End PBXCopyFilesBuildPhase section */

/* Begin PBXFileReference section */
\t\t{FR_SWIFT_APP} /* NunusHostApp.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = NunusHostApp.swift; sourceTree = "<group>"; }};
\t\t{FR_HANDLER} /* SafariWebExtensionHandler.swift */ = {{isa = PBXFileReference; lastKnownFileType = sourcecode.swift; path = SafariWebExtensionHandler.swift; sourceTree = "<group>"; }};
\t\t{FR_INFO} /* Info.plist */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.xml; path = Info.plist; sourceTree = "<group>"; }};
\t\t{FR_HOST_ENT} /* NunusHost.entitlements */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = NunusHost.entitlements; sourceTree = "<group>"; }};
\t\t{FR_ASSETS} /* Assets.xcassets */ = {{isa = PBXFileReference; lastKnownFileType = folder.assetcatalog; path = Assets.xcassets; sourceTree = "<group>"; }};
\t\t{FR_APPICNS} /* AppIcon.icns */ = {{isa = PBXFileReference; lastKnownFileType = image.icns; path = AppIcon.icns; sourceTree = "<group>"; }};
\t\t{FR_EXT_ENT} /* NunusExtension.entitlements */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = NunusExtension.entitlements; sourceTree = "<group>"; }};
\t\t{FR_SCRIPT} /* copy-web-extension-resources.sh */ = {{isa = PBXFileReference; lastKnownFileType = text.script.sh; path = "copy-web-extension-resources.sh"; sourceTree = "<group>"; }};
\t\t{FR_IOS_HOST_ENT} /* NunusHostIOS.entitlements */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = NunusHostIOS.entitlements; sourceTree = "<group>"; }};
\t\t{FR_IOS_EXT_ENT} /* NunusExtensionIOS.entitlements */ = {{isa = PBXFileReference; lastKnownFileType = text.plist.entitlements; path = NunusExtensionIOS.entitlements; sourceTree = "<group>"; }};
\t\t{PR_HOST_APP} /* NunusHost.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = NunusHost.app; sourceTree = BUILT_PRODUCTS_DIR; }};
\t\t{PR_EXT_APPEX} /* NunusExtension.appex */ = {{isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = NunusExtension.appex; sourceTree = BUILT_PRODUCTS_DIR; }};
\t\t{PR_HOST_IOS} /* NunusHostIOS.app */ = {{isa = PBXFileReference; explicitFileType = wrapper.application; includeInIndex = 0; path = NunusHostIOS.app; sourceTree = BUILT_PRODUCTS_DIR; }};
\t\t{PR_EXT_IOS} /* NunusExtensioniOS.appex */ = {{isa = PBXFileReference; explicitFileType = "wrapper.app-extension"; includeInIndex = 0; path = NunusExtensioniOS.appex; sourceTree = BUILT_PRODUCTS_DIR; }};
/* End PBXFileReference section */

/* Begin PBXFrameworksBuildPhase section */
\t\t{FW_MAC_H} /* Frameworks */ = {{isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = ( ); runOnlyForDeploymentPostprocessing = 0; }};
\t\t{FW_MAC_E} /* Frameworks */ = {{isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = ( ); runOnlyForDeploymentPostprocessing = 0; }};
\t\t{FW_IOS_H} /* Frameworks */ = {{isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = ( ); runOnlyForDeploymentPostprocessing = 0; }};
\t\t{FW_IOS_E} /* Frameworks */ = {{isa = PBXFrameworksBuildPhase; buildActionMask = 2147483647; files = ( ); runOnlyForDeploymentPostprocessing = 0; }};
/* End PBXFrameworksBuildPhase section */

/* Begin PBXGroup section */
\t\t{G_MAIN} = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{G_SHARED} /* Shared */,
\t\t\t\t{G_HOST} /* Host */,
\t\t\t\t{G_EXT} /* Extension */,
\t\t\t\t{G_IOS} /* iOS */,
\t\t\t\t{G_SCRIPTS} /* scripts */,
\t\t\t\t{G_PROD} /* Products */,
\t\t\t);
\t\t\tsourceTree = "<group>";
\t\t}};
\t\t{G_SHARED} /* Shared */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{FR_SWIFT_APP} /* NunusHostApp.swift */,
\t\t\t);
\t\t\tpath = Shared;
\t\t\tsourceTree = "<group>";
\t\t}};
\t\t{G_HOST} /* Host */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{FR_ASSETS} /* Assets.xcassets */,
\t\t\t\t{FR_APPICNS} /* AppIcon.icns */,
\t\t\t\t{FR_HOST_ENT} /* NunusHost.entitlements */,
\t\t\t);
\t\t\tpath = Host;
\t\t\tsourceTree = "<group>";
\t\t}};
\t\t{G_EXT} /* Extension */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{FR_HANDLER} /* SafariWebExtensionHandler.swift */,
\t\t\t\t{FR_INFO} /* Info.plist */,
\t\t\t\t{FR_EXT_ENT} /* NunusExtension.entitlements */,
\t\t\t);
\t\t\tpath = Extension;
\t\t\tsourceTree = "<group>";
\t\t}};
\t\t{G_IOS} /* iOS */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{FR_IOS_HOST_ENT} /* NunusHostIOS.entitlements */,
\t\t\t\t{FR_IOS_EXT_ENT} /* NunusExtensionIOS.entitlements */,
\t\t\t);
\t\t\tpath = iOS;
\t\t\tsourceTree = "<group>";
\t\t}};
\t\t{G_SCRIPTS} /* scripts */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{FR_SCRIPT} /* copy-web-extension-resources.sh */,
\t\t\t);
\t\t\tpath = scripts;
\t\t\tsourceTree = "<group>";
\t\t}};
\t\t{G_PROD} /* Products */ = {{
\t\t\tisa = PBXGroup;
\t\t\tchildren = (
\t\t\t\t{PR_HOST_APP} /* NunusHost.app */,
\t\t\t\t{PR_EXT_APPEX} /* NunusExtension.appex */,
\t\t\t\t{PR_HOST_IOS} /* NunusHostIOS.app */,
\t\t\t\t{PR_EXT_IOS} /* NunusExtensioniOS.appex */,
\t\t\t);
\t\t\tname = Products;
\t\t\tsourceTree = "<group>";
\t\t}};
/* End PBXGroup section */

/* Begin PBXNativeTarget section */
\t\t{T_HOST_MAC} /* NunusHost */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {XC_HMAC} /* Build configuration list for PBXNativeTarget "NunusHost" */;
\t\t\tbuildPhases = (
\t\t\t\t{SRC_HOST_MAC} /* Sources */,
\t\t\t\t{FW_MAC_H} /* Frameworks */,
\t\t\t\t{RS_MAC} /* Resources */,
\t\t\t\t{CP_MAC} /* Embed Foundation Extensions */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t\t{TD_MAC} /* PBXTargetDependency */,
\t\t\t);
\t\t\tname = NunusHost;
\t\t\tproductName = NunusHost;
\t\t\tproductReference = {PR_HOST_APP} /* NunusHost.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t}};
\t\t{T_EXT_MAC} /* NunusExtension */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {XC_EMAC} /* Build configuration list for PBXNativeTarget "NunusExtension" */;
\t\t\tbuildPhases = (
\t\t\t\t{SH_MAC} /* Copy web extension resources */,
\t\t\t\t{SRC_EXT_MAC} /* Sources */,
\t\t\t\t{FW_MAC_E} /* Frameworks */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = NunusExtension;
\t\t\tproductName = NunusExtension;
\t\t\tproductReference = {PR_EXT_APPEX} /* NunusExtension.appex */;
\t\t\tproductType = "com.apple.product-type.app-extension";
\t\t}};
\t\t{T_HOST_IOS} /* NunusHostIOS */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {XC_HIOS} /* Build configuration list for PBXNativeTarget "NunusHostIOS" */;
\t\t\tbuildPhases = (
\t\t\t\t{SRC_HOST_IOS} /* Sources */,
\t\t\t\t{FW_IOS_H} /* Frameworks */,
\t\t\t\t{CP_IOS} /* Embed Foundation Extensions */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t\t{TD_IOS} /* PBXTargetDependency */,
\t\t\t);
\t\t\tname = NunusHostIOS;
\t\t\tproductName = NunusHostIOS;
\t\t\tproductReference = {PR_HOST_IOS} /* NunusHostIOS.app */;
\t\t\tproductType = "com.apple.product-type.application";
\t\t}};
\t\t{T_EXT_IOS} /* NunusExtensioniOS */ = {{
\t\t\tisa = PBXNativeTarget;
\t\t\tbuildConfigurationList = {XC_EIOS} /* Build configuration list for PBXNativeTarget "NunusExtensioniOS" */;
\t\t\tbuildPhases = (
\t\t\t\t{SH_IOS} /* Copy web extension resources */,
\t\t\t\t{SRC_EXT_IOS} /* Sources */,
\t\t\t\t{FW_IOS_E} /* Frameworks */,
\t\t\t);
\t\t\tbuildRules = (
\t\t\t);
\t\t\tdependencies = (
\t\t\t);
\t\t\tname = NunusExtensioniOS;
\t\t\tproductName = NunusExtensioniOS;
\t\t\tproductReference = {PR_EXT_IOS} /* NunusExtensioniOS.appex */;
\t\t\tproductType = "com.apple.product-type.app-extension";
\t\t}};
/* End PBXNativeTarget section */

/* Begin PBXProject section */
\t\t{P_ROOT} /* Project object */ = {{
\t\t\tisa = PBXProject;
\t\t\tattributes = {{
\t\t\t\tBuildIndependentTargetsInParallel = 1;
\t\t\t\tLastSwiftUpdateCheck = 1500;
\t\t\t\tLastUpgradeCheck = 1500;
\t\t\t\tTargetAttributes = {{
\t\t\t\t\t{T_HOST_MAC} = {{CreatedOnToolsVersion = 15.0; }};
\t\t\t\t\t{T_EXT_MAC} = {{CreatedOnToolsVersion = 15.0; }};
\t\t\t\t\t{T_HOST_IOS} = {{CreatedOnToolsVersion = 15.0; }};
\t\t\t\t\t{T_EXT_IOS} = {{CreatedOnToolsVersion = 15.0; }};
\t\t\t\t}};
\t\t\t}};
\t\t\tbuildConfigurationList = {XC_PROJ} /* Build configuration list for PBXProject "NunusSafari" */;
\t\t\tcompatibilityVersion = "Xcode 14.0";
\t\t\tdevelopmentRegion = en;
\t\t\thasScannedForEncodings = 0;
\t\t\tknownRegions = (
\t\t\t\ten,
\t\t\t\tBase,
\t\t\t);
\t\t\tmainGroup = {G_MAIN};
\t\t\tproductRefGroup = {G_PROD} /* Products */;
\t\t\tprojectDirPath = "";
\t\t\tprojectRoot = "";
\t\t\ttargets = (
\t\t\t\t{T_HOST_MAC} /* NunusHost */,
\t\t\t\t{T_EXT_MAC} /* NunusExtension */,
\t\t\t\t{T_HOST_IOS} /* NunusHostIOS */,
\t\t\t\t{T_EXT_IOS} /* NunusExtensioniOS */,
\t\t\t);
\t\t}};
/* End PBXProject section */

/* Begin PBXResourcesBuildPhase section */
\t\t{RS_MAC} /* Resources */ = {{
\t\t\tisa = PBXResourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t\t{BF_APPICNS_MAC} /* AppIcon.icns in Resources */,
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
/* End PBXResourcesBuildPhase section */

/* Begin PBXShellScriptBuildPhase section */
\t\t{SH_MAC} /* Copy web extension resources */ = {{
\t\t\tisa = PBXShellScriptBuildPhase;
\t\t\talwaysOutOfDate = 1;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\tname = "Copy web extension resources";
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t\tshellPath = /bin/sh;
\t\t\tshellScript = "cd \\"$PROJECT_DIR\\" && /bin/sh ./scripts/copy-web-extension-resources.sh\\n";
\t\t}};
\t\t{SH_IOS} /* Copy web extension resources */ = {{
\t\t\tisa = PBXShellScriptBuildPhase;
\t\t\talwaysOutOfDate = 1;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t);
\t\t\tname = "Copy web extension resources";
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t\tshellPath = /bin/sh;
\t\t\tshellScript = "cd \\"$PROJECT_DIR\\" && /bin/sh ./scripts/copy-web-extension-resources.sh\\n";
\t\t}};
/* End PBXShellScriptBuildPhase section */

/* Begin PBXSourcesBuildPhase section */
\t\t{SRC_HOST_MAC} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t\t{BF_APP_MAC} /* NunusHostApp.swift in Sources */,
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{SRC_EXT_MAC} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t\t{BF_HANDLER_MAC} /* SafariWebExtensionHandler.swift in Sources */,
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{SRC_HOST_IOS} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t\t{BF_APP_IOS} /* NunusHostApp.swift in Sources */,
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
\t\t{SRC_EXT_IOS} /* Sources */ = {{
\t\t\tisa = PBXSourcesBuildPhase;
\t\t\tbuildActionMask = 2147483647;
\t\t\tfiles = (
\t\t\t\t{BF_HANDLER_IOS} /* SafariWebExtensionHandler.swift in Sources */,
\t\t\t);
\t\t\trunOnlyForDeploymentPostprocessing = 0;
\t\t}};
/* End PBXSourcesBuildPhase section */

/* Begin PBXTargetDependency section */
\t\t{TD_MAC} /* PBXTargetDependency */ = {{
\t\t\tisa = PBXTargetDependency;
\t\t\ttarget = {T_EXT_MAC} /* NunusExtension */;
\t\t\ttargetProxy = {PX_MAC} /* PBXContainerItemProxy */;
\t\t}};
\t\t{TD_IOS} /* PBXTargetDependency */ = {{
\t\t\tisa = PBXTargetDependency;
\t\t\ttarget = {T_EXT_IOS} /* NunusExtensioniOS */;
\t\t\ttargetProxy = {PX_IOS} /* PBXContainerItemProxy */;
\t\t}};
/* End PBXTargetDependency section */

/* Begin XCBuildConfiguration section */
\t\t{DBG_PROJ} /* Debug */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCLANG_ENABLE_OBJC_ARC = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
\t\t\t\tDEBUG_INFORMATION_FORMAT = dwarf;
\t\t\t\tENABLE_TESTABILITY = YES;
\t\t\t\tGCC_DYNAMIC_NO_PIC = NO;
\t\t\t\tGCC_OPTIMIZATION_LEVEL = 0;
\t\t\t\tONLY_ACTIVE_ARCH = YES;
\t\t\t\tSWIFT_ACTIVE_COMPILATION_CONDITIONS = DEBUG;
\t\t\t\tSWIFT_OPTIMIZATION_LEVEL = "-Onone";
\t\t\t}};
\t\t\tname = Debug;
\t\t}};
\t\t{REL_PROJ} /* Release */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tALWAYS_SEARCH_USER_PATHS = NO;
\t\t\t\tCLANG_ENABLE_MODULES = YES;
\t\t\t\tCLANG_ENABLE_OBJC_ARC = YES;
\t\t\t\tCOPY_PHASE_STRIP = NO;
\t\t\t\tDEBUG_INFORMATION_FORMAT = "dwarf-with-dsym";
\t\t\t\tENABLE_NS_ASSERTIONS = NO;
\t\t\t\tSWIFT_COMPILATION_MODE = wholemodule;
\t\t\t}};
\t\t\tname = Release;
\t\t}};
\t\t{DBG_HMAC} /* Debug */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tCODE_SIGN_ENTITLEMENTS = Host/NunusHost.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tENABLE_PREVIEWS = YES;
\t\t\t\tGENERATE_INFOPLIST_FILE = YES;
\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = Nunus;
\t\t\t\tINFOPLIST_KEY_CFBundleIconFile = AppIcon;
\t\t\t\tINFOPLIST_KEY_NSHumanReadableCopyright = "";
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/../Frameworks",
\t\t\t\t);
\t\t\t\tMACOSX_DEPLOYMENT_TARGET = 14.0;
\t\t\t\tMARKETING_VERSION = 1.5.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.nunus.NunusHost;
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSDKROOT = macosx;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t}};
\t\t\tname = Debug;
\t\t}};
\t\t{REL_HMAC} /* Release */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tCODE_SIGN_ENTITLEMENTS = Host/NunusHost.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tENABLE_PREVIEWS = YES;
\t\t\t\tGENERATE_INFOPLIST_FILE = YES;
\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = Nunus;
\t\t\t\tINFOPLIST_KEY_CFBundleIconFile = AppIcon;
\t\t\t\tINFOPLIST_KEY_NSHumanReadableCopyright = "";
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/../Frameworks",
\t\t\t\t);
\t\t\t\tMACOSX_DEPLOYMENT_TARGET = 14.0;
\t\t\t\tMARKETING_VERSION = 1.5.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.nunus.NunusHost;
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSDKROOT = macosx;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t}};
\t\t\tname = Release;
\t\t}};
\t\t{DBG_EMAC} /* Debug */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tCODE_SIGN_ENTITLEMENTS = Extension/NunusExtension.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = Extension/Info.plist;
\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = Nunus;
\t\t\t\tINFOPLIST_KEY_NSHumanReadableCopyright = "";
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/../Frameworks",
\t\t\t\t\t"@executable_path/../../../../Frameworks",
\t\t\t\t);
\t\t\t\tMACOSX_DEPLOYMENT_TARGET = 14.0;
\t\t\t\tMARKETING_VERSION = 1.5.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.nunus.NunusHost.NunusExtension;
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSDKROOT = macosx;
\t\t\t\tSKIP_INSTALL = YES;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t}};
\t\t\tname = Debug;
\t\t}};
\t\t{REL_EMAC} /* Release */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tCODE_SIGN_ENTITLEMENTS = Extension/NunusExtension.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = Extension/Info.plist;
\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = Nunus;
\t\t\t\tINFOPLIST_KEY_NSHumanReadableCopyright = "";
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/../Frameworks",
\t\t\t\t\t"@executable_path/../../../../Frameworks",
\t\t\t\t);
\t\t\t\tMACOSX_DEPLOYMENT_TARGET = 14.0;
\t\t\t\tMARKETING_VERSION = 1.5.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.nunus.NunusHost.NunusExtension;
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSDKROOT = macosx;
\t\t\t\tSKIP_INSTALL = YES;
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t}};
\t\t\tname = Release;
\t\t}};
\t\t{DBG_HIOS} /* Debug */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tCODE_SIGN_ENTITLEMENTS = iOS/NunusHostIOS.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tENABLE_PREVIEWS = YES;
\t\t\t\tGENERATE_INFOPLIST_FILE = YES;
\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = Nunus;
\t\t\t\tINFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
\t\t\t\tINFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES;
\t\t\t\tINFOPLIST_KEY_UILaunchScreen_Generation = YES;
\t\t\t\tINFOPLIST_KEY_UISupportedInterfaceOrientations_iPad = "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
\t\t\t\tINFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone = "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/Frameworks",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = 1.5.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.nunus.NunusHostIOS;
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tSUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t}};
\t\t\tname = Debug;
\t\t}};
\t\t{REL_HIOS} /* Release */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tCODE_SIGN_ENTITLEMENTS = iOS/NunusHostIOS.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tENABLE_PREVIEWS = YES;
\t\t\t\tGENERATE_INFOPLIST_FILE = YES;
\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = Nunus;
\t\t\t\tINFOPLIST_KEY_UIApplicationSceneManifest_Generation = YES;
\t\t\t\tINFOPLIST_KEY_UIApplicationSupportsIndirectInputEvents = YES;
\t\t\t\tINFOPLIST_KEY_UILaunchScreen_Generation = YES;
\t\t\t\tINFOPLIST_KEY_UISupportedInterfaceOrientations_iPad = "UIInterfaceOrientationPortrait UIInterfaceOrientationPortraitUpsideDown UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
\t\t\t\tINFOPLIST_KEY_UISupportedInterfaceOrientations_iPhone = "UIInterfaceOrientationPortrait UIInterfaceOrientationLandscapeLeft UIInterfaceOrientationLandscapeRight";
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/Frameworks",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = 1.5.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.nunus.NunusHostIOS;
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tSUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t}};
\t\t\tname = Release;
\t\t}};
\t\t{DBG_EIOS} /* Debug */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tCODE_SIGN_ENTITLEMENTS = iOS/NunusExtensionIOS.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = Extension/Info.plist;
\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = Nunus;
\t\t\t\tINFOPLIST_KEY_NSHumanReadableCopyright = "";
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/Frameworks",
\t\t\t\t\t"@executable_path/../../Frameworks",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = 1.5.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.nunus.NunusHostIOS.NunusExtensioniOS;
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tSKIP_INSTALL = YES;
\t\t\t\tSUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t}};
\t\t\tname = Debug;
\t\t}};
\t\t{REL_EIOS} /* Release */ = {{
\t\t\tisa = XCBuildConfiguration;
\t\t\tbuildSettings = {{
\t\t\t\tCODE_SIGN_ENTITLEMENTS = iOS/NunusExtensionIOS.entitlements;
\t\t\t\tCODE_SIGN_STYLE = Automatic;
\t\t\t\tCURRENT_PROJECT_VERSION = 1;
\t\t\t\tGENERATE_INFOPLIST_FILE = NO;
\t\t\t\tINFOPLIST_FILE = Extension/Info.plist;
\t\t\t\tINFOPLIST_KEY_CFBundleDisplayName = Nunus;
\t\t\t\tINFOPLIST_KEY_NSHumanReadableCopyright = "";
\t\t\t\tIPHONEOS_DEPLOYMENT_TARGET = 17.0;
\t\t\t\tLD_RUNPATH_SEARCH_PATHS = (
\t\t\t\t\t"$(inherited)",
\t\t\t\t\t"@executable_path/Frameworks",
\t\t\t\t\t"@executable_path/../../Frameworks",
\t\t\t\t);
\t\t\t\tMARKETING_VERSION = 1.5.0;
\t\t\t\tPRODUCT_BUNDLE_IDENTIFIER = com.nunus.NunusHostIOS.NunusExtensioniOS;
\t\t\t\tPRODUCT_NAME = "$(TARGET_NAME)";
\t\t\t\tSDKROOT = iphoneos;
\t\t\t\tSKIP_INSTALL = YES;
\t\t\t\tSUPPORTED_PLATFORMS = "iphoneos iphonesimulator";
\t\t\t\tSWIFT_EMIT_LOC_STRINGS = YES;
\t\t\t\tSWIFT_VERSION = 5.0;
\t\t\t\tTARGETED_DEVICE_FAMILY = "1,2";
\t\t\t}};
\t\t\tname = Release;
\t\t}};
/* End XCBuildConfiguration section */

/* Begin XCConfigurationList section */
\t\t{XC_HMAC} /* Build configuration list for PBXNativeTarget "NunusHost" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{DBG_HMAC} /* Debug */,
\t\t\t\t{REL_HMAC} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
\t\t{XC_EMAC} /* Build configuration list for PBXNativeTarget "NunusExtension" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{DBG_EMAC} /* Debug */,
\t\t\t\t{REL_EMAC} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
\t\t{XC_HIOS} /* Build configuration list for PBXNativeTarget "NunusHostIOS" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{DBG_HIOS} /* Debug */,
\t\t\t\t{REL_HIOS} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
\t\t{XC_EIOS} /* Build configuration list for PBXNativeTarget "NunusExtensioniOS" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{DBG_EIOS} /* Debug */,
\t\t\t\t{REL_EIOS} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
\t\t{XC_PROJ} /* Build configuration list for PBXProject "NunusSafari" */ = {{
\t\t\tisa = XCConfigurationList;
\t\t\tbuildConfigurations = (
\t\t\t\t{DBG_PROJ} /* Debug */,
\t\t\t\t{REL_PROJ} /* Release */,
\t\t\t);
\t\t\tdefaultConfigurationIsVisible = 0;
\t\t\tdefaultConfigurationName = Release;
\t\t}};
/* End XCConfigurationList section */
\t}};
\trootObject = {P_ROOT} /* Project object */;
}}
"""

with open(
    os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "NunusSafari.xcodeproj", "project.pbxproj")
    ),
    "w",
    encoding="utf-8",
) as f:
    f.write(s)
print("Wrote project.pbxproj")
