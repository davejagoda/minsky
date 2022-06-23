/*
  @copyright Steve Keen 2021
  @author Russell Standish
  This file is part of Minsky.

  Minsky is free software: you can redistribute it and/or modify it
  under the terms of the GNU General Public License as published by
  the Free Software Foundation, either version 3 of the License, or
  (at your option) any later version.

  Minsky is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU General Public License for more details.

  You should have received a copy of the GNU General Public License
  along with Minsky.  If not, see <http://www.gnu.org/licenses/>.
*/

/* We have created a struct `WindowInformation` that stores the `childWindowId` along with other details like display and window attributes. This information is reused across multiple calls to `renderFrame`. 

The flow for code will be -- when minsky starts, a call to /minsky/canvas/initializeNativeWindow will be made, with parentWindowId (and offsets) as the parameters (creating child window in electron did not work as expected, so we need to work with offsets). Subsequent repaints can be requested with /minsky/canvas/renderFrame

As of now, we create the cairo surface with each call to `renderFrame`, though I think the surface can also be reused. I have a placeholder for pointer to cairo::SurfacePtr (not sure we should have pointer to pointer) but it didn't work as expected, so for now I am recreating the surface in `renderFrame`

Please especially review the lifecycle (constructors, desctructors and copy constructors) that I have defined in `renderNativeWindow.cc `. I think the WindowInformation object that is destroyed in the destructor for RenderNativeWindow can be reused (perhaps it can be made a static object?). Also - am not sure how to distinguish between destructor for RenderNativeWindow that will be called with each call to load model (or undo/redo as you mentioned), and the final call when minsky is closed.
 */

#include "renderNativeWindow.h"
#include "windowInformation.h"
#include "minsky.h"
#include "minsky_epilogue.h"

#include <stdexcept>
#include <string>
#include <chrono>

using namespace std;
using namespace ecolab;

#define FPS_PROFILING_ON
#ifdef WIN32
#include <windows.h>
//#include <windowsx.h>
//#include <wingdi.h>
//#include <winuser.h>
#undef NTDDI_VERSION
#define NTDDI_VERSION NTDDI_WINBLUE
#include <shellscalingapi.h>
#endif

namespace minsky
{
  ecolab::cairo::Colour RenderNativeWindow::backgroundColour{0.8,0.8,0.8,1};
  
  static cairo_status_t appendDataToBufferNOP(void *p, const unsigned char *data, unsigned length)
  {
    return CAIRO_STATUS_SUCCESS;
  }

  namespace
  {
    // default dummy surface to arrange a callback on requestRedraw
    class NativeSurface : public cairo::Surface
    {
      RenderNativeWindow &renderNativeWindow;

    public:
      NativeSurface(RenderNativeWindow &r, cairo_surface_t *s = nullptr, int width = -1, int height = -1) : cairo::Surface(s, width, height), renderNativeWindow(r) {}
      void requestRedraw() override {renderNativeWindow.requestRedraw();}
    };
  } // namespace

    RenderNativeWindow::~RenderNativeWindow()
    {
      minsky().nativeWindowsToRedraw.erase(this);
    }
  
  void RenderNativeWindow::renderFrame(uint64_t parentWindowId, int offsetLeft, int offsetTop, int childWidth, int childHeight, double scalingFactor)
  {
    winInfoPtr.reset();
    winInfoPtr = std::make_shared<WindowInformation>(parentWindowId, offsetLeft, offsetTop, childWidth, childHeight, scalingFactor, [this](){draw();});
    surface.reset(new NativeSurface(*this)); // ensure callback on requestRedraw works
    surface->requestRedraw();
    enabled=true;
  }

  void RenderNativeWindow::destroyFrame() {winInfoPtr.reset();}


  
  void RenderNativeWindow::requestRedraw()
  {
    if (!enabled) return;
#ifdef MAC_OSX_TK
    if (winInfoPtr.get()) winInfoPtr->requestRedraw();
#else
    minsky().nativeWindowsToRedraw.insert(this);
#endif
  }

  
  void RenderNativeWindow::draw()
  {
    if (!enabled || !winInfoPtr.get() || winInfoPtr->getRenderingFlag())
    {
      return;
    }

#ifdef FPS_PROFILING_ON
    unsigned long t0_render_start = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
#endif


    auto surfaceToDraw = winInfoPtr->getBufferSurface();
    if (!surfaceToDraw) return;
    winInfoPtr->setRenderingFlag(true);
    surfaceToDraw.swap(surface);

    cairo_reset_clip(surface->cairo());
    ecolab::cairo::CairoSave cs(surface->cairo());
    cairo_set_source_rgba(surface->cairo(), backgroundColour.r,backgroundColour.g,backgroundColour.b,backgroundColour.a);
    cairo_rectangle(surface->cairo(), 0, 0, winInfoPtr->childWidth, winInfoPtr->childHeight);
    cairo_fill(surface->cairo());
    cairo_set_source_rgb(surface->cairo(), 0, 0, 0);

//  cairo_arc(surface->cairo(), 100,100,100,0,2*M_PI);
//  cairo_set_source_rgb(surface->cairo(),1,0,0);
//  cairo_fill(surface->cairo());
    redraw(0, 0, winInfoPtr->childWidth, winInfoPtr->childHeight);

#ifdef FPS_PROFILING_ON
    unsigned long t1_png_stream_start = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
#endif

#ifdef FPS_PROFILING_ON
    unsigned long t2_window_copy_start = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();
#endif

    surfaceToDraw.swap(surface);
    winInfoPtr->setRenderingFlag(false);
    winInfoPtr->copyBufferToMain();

    
#ifdef FPS_PROFILING_ON
    unsigned long t3_render_over = std::chrono::duration_cast<std::chrono::milliseconds>(std::chrono::system_clock::now().time_since_epoch()).count();

    unsigned long windowCopyTime = t3_render_over - t2_window_copy_start;
    unsigned long pngStreamWriteTime = t2_window_copy_start - t1_png_stream_start;
    unsigned long totalTime = t3_render_over - t0_render_start;

    cout << "Rendering Time (ms): " << totalTime << " (total) | " << windowCopyTime << " (window copy) | " << pngStreamWriteTime << " (png stream overhead) " << endl;
#endif
  }

  void RenderNativeWindow::resizeWindow(int offsetLeft, int offsetTop, int childWidth, int childHeight)
  {
    // TODO:: To be implemented... need to recreate child window
  }

      double RenderNativeWindow::scaleFactor() const
      {
#ifdef WIN32
        DEVICE_SCALE_FACTOR scaleFactor;
        GetScaleFactorForMonitor(MonitorFromPoint(POINT{0,0}, MONITOR_DEFAULTTOPRIMARY), &scaleFactor);
        return scaleFactor/100.0;
#else
        return 1;
#endif
      }

} // namespace minsky
