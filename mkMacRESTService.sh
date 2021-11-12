#!/bin/bash

# creates a Mac .pkg installer. 

# This script is intended to be called from make mac-dist target

# ensure ~/usr/bin overrides every other TCL installation
PATH=~/usr/bin:$PATH

# check that EcoLab and Tk has been built for extracting a quartz context
if ! nm ecolab/lib/libecolab.a|c++filt|grep NSContext::NSContext|grep T; then
    echo "Rebuild EcoLab with MAC_OSX_TK=1"
    exit 1
fi

MAC_DIST_DIR=minskyRESTService
version=`cut -f3 -d' ' minskyVersion.h|head -1|tr -d '"'`
if [ $version = '"unknown"' ]; then
    version=0.0.0.0
fi

# determine release or beta depending on the number of fields separated by '-' in the version string
numFields=`echo $version|tr - ' '|wc -w`
if [ $numFields -le 1 ]; then
    productName=Minsky
else
    productName=MinskyBeta
fi

rewrite_dylib()
{
    local dylib=$1
    local target=$2
    cp -f $dylib $MAC_DIST_DIR
    chmod u+rw $MAC_DIST_DIR/${dylib##*/}
    rewrite_dylibs $MAC_DIST_DIR/${dylib##*/}
    echo "install_name_tool -change $dylib @loader_path/${dylib##*/} $target"
    install_name_tool -change $dylib @loader_path/${dylib##*/} $target
}

rewrite_dylibs()
{
    local target=$1
    echo "rewrite_dylibs $target"
    otool -L $target|grep opt/|cut -f1 -d' '|while read dylib; do
        # avoid infinite loops
        if [ "${dylib##*/}" == "${target##*/}" ]; then 
            install_name_tool -change $dylib @loader_path/${dylib##*/} $target
            continue
        else
            rewrite_dylib $dylib $target
        fi
    done
    otool -L $target|grep usr/local|cut -f1 -d' '|while read dylib; do
        rewrite_dylib $dylib $target
    done
    
    install_name_tool -id @loader_path/${target##*/} $target
}

rm -rf $MAC_DIST_DIR
mkdir -p $MAC_DIST_DIR
cp RESTService/minskyRESTService.node $MAC_DIST_DIR
rewrite_dylibs $MAC_DIST_DIR/minskyRESTService.node

# due to the presence of -isystem /usr/local/lib, which is needed for other idiocies, libjson_spirit is not correctly rewritten by the above
rewrite_dylib /usr/local/lib/libjson_spirit.dylib $MAC_DIST_DIR/minskyRESTService.node
install_name_tool -change libjson_spirit.dylib @loader_path/libjson_spirit.dylib $MAC_DIST_DIR/minskyRESTService.node

tar zcvf minskyRESTService.tar.gz $MAC_DIST_DIR
exit

