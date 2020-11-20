/*
  @copyright Steve Keen 2020
  @author Russell Standish
  @author Wynand Dednam
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
#include "parVarSheet.h"
#include "latexMarkup.h"
#include "group.h"
#include <pango.h>
#include "minsky_epilogue.h"
#include "minsky.h"
using namespace std;
using ecolab::cairo::Surface;
using ecolab::Pango;
using ecolab::cairo::CairoSave;

namespace minsky
{

  void ParVarSheet::populateItemVector() {
    itemVector.clear();	
    minsky().canvas.model->recursiveDo(&GroupItems::items,
                                       [&](Items&, Items::iterator i) {                                 
                                         if (variableSelector(*i))		                                 
                                           itemVector.emplace_back(*i);
                                         return false;
                                       });   	
  }
	
  void ParVarSheet::draw(cairo_t* cairo)
  {   
    try
      {	
      		
        if (!itemVector.empty())
          {
            float x0, y0=1.5*rowHeight;//+pango.height();	
            double w=0,h=0,h_prev,lh; 
            for (auto& it: itemVector)
              {
                auto v=it->variableCast();
                auto value=v->vValue();
                auto rank=value->hypercube().rank();
                auto dims=value->hypercube().dims();                
                Pango pango(cairo);      
                x0=0.0;
                float x=x0, y=y0;
                double colWidth=0;
                pango.setMarkup("9999");
                if (rank==0)
                  { 
                    varAttribVals.clear();
                    varAttribVals.push_back(v->name());
                    varAttribVals.push_back(v->init());
                    varAttribVals.push_back(it->tooltip);
                    varAttribVals.push_back(it->detailedText);
                    varAttribVals.push_back(to_string(v->sliderStep));
                    varAttribVals.push_back(to_string(v->sliderMin));
                    varAttribVals.push_back(to_string(v->sliderMax));
                    varAttribVals.push_back(to_string(v->value()));
                    
                    for (auto& i:varAttrib) 
                      {
                        cairo_move_to(cairo,x,y-1.5*rowHeight);                    
                        pango.setMarkup(i);
                        pango.show();                  
                        colWidth=std::max(colWidth,5+pango.width());  
                        x+=colWidth;					    
                      }
					
                    x=0;
                    for (auto& i : varAttribVals)
                      {
                        cairo_move_to(cairo,x,y-0.5*rowHeight);                    
                        pango.setMarkup(latexToPango(i));
                        pango.show();                    
                        colWidth=std::max(colWidth,5+pango.width());
                        x+=colWidth;		
                      }
                    h_prev=h;
                    w=0;h=0;      
                    cairo_get_current_point (cairo,&w,&h);   
                    if (h<h_prev) h+=h_prev;                                                                         
                    // draw grid
                    {
				      		
                      cairo::CairoSave cs(cairo);
                      cairo_set_source_rgba(cairo,0,0,0,0.2);
                      for (y=y0-1.5*rowHeight; y<h+rowHeight; y+=2*rowHeight)
                        {
                          cairo_rectangle(cairo,x0,y,w+colWidth,rowHeight);
                          cairo_fill(cairo);
                        }

                    }
                    { // draw vertical grid lines
                      cairo::CairoSave cs(cairo);
                      cairo_set_source_rgba(cairo,0,0,0,0.5);
                      for (x=x0; x<w+colWidth; x+=colWidth)
                        {
                          cairo_move_to(cairo,x,y-2*rowHeight);
                          cairo_line_to(cairo,x,y+0.5*rowHeight);
                          cairo_stroke(cairo);
                        }
                    }                                            
                    { // draw horizontal grid line
                      cairo::CairoSave cs(cairo);
                      cairo_set_source_rgba(cairo,0,0,0,0.5);
                      cairo_move_to(cairo,x0,y0-0.5*rowHeight);
                      cairo_line_to(cairo,w+colWidth,y0-0.5*rowHeight);
                      cairo_stroke(cairo);
                    }                                  
                    cairo::CairoSave cs(cairo);
                    // make sure rectangle has right height
                    cairo_rectangle(cairo,x0,y0-1.5*rowHeight,w+colWidth,y-y0+2*rowHeight);    
                    cairo_stroke(cairo);                          	          
                    cairo_clip(cairo);	                               
                  }
                else if (rank==1)
                  {
                    cairo_move_to(cairo,x,y-1.5*rowHeight);
                    pango.setMarkup(latexToPango(value->name)+":");
                    pango.show();              
                    string format=value->hypercube().xvectors[0].dimension.units;
                    for (auto& i: value->hypercube().xvectors[0])
                      {
                        cairo_move_to(cairo,x,y);
                        pango.setText(trimWS(str(i,format)));
                        pango.show();
                        y+=rowHeight;
                        colWidth=std::max(colWidth,5+pango.width());
                      }
                    y=y0;
                    lh=0;                        
                    for (size_t j=0; j<dims[0]; ++j)
                      lh+=rowHeight;                    
                    { // draw vertical grid line
                      cairo::CairoSave cs(cairo);
                      cairo_set_source_rgba(cairo,0,0,0,0.5);
                      cairo_move_to(cairo,colWidth-2.5,y0);
                      cairo_line_to(cairo,colWidth-2.5,y0+lh);
                      cairo_stroke(cairo);
                    }                                       
                    x+=colWidth;
                    for (size_t i=0; i<value->size(); ++i)
                      {
                        if (!value->index().empty())
                          y=y0+value->index()[i]*rowHeight;
                        cairo_move_to(cairo,x,y);
                        auto v=value->value(i);
                        if (!std::isnan(v))
                          {
                            pango.setMarkup(str(v));
                            pango.show();
                          }
                        y+=rowHeight;
                      } 
                    h_prev=h;
                    w=0;h=0;      
                    cairo_get_current_point (cairo,&w,&h);   
                    if (h<h_prev) h+=h_prev;                                                                        
                    // draw grid
                    {
                      cairo::CairoSave cs(cairo);
                      cairo_set_source_rgba(cairo,0,0,0,0.2);
                      for (y=y0+rowHeight; y<h+rowHeight; y+=2*rowHeight)
                        {
                          cairo_rectangle(cairo,0.0,y,w+colWidth,rowHeight);
                          cairo_fill(cairo);
                        }
                    }
                    cairo::CairoSave cs(cairo);
                    float rectHeight=0;
                    // make sure rectangle has right height
                    if ((value->size()&1)!=0) rectHeight= y-y0;
                    else rectHeight=y-y0-rowHeight;                    
                    cairo_rectangle(cairo,0.0,y0,w+colWidth,rectHeight);    
                    cairo_stroke(cairo);                          
                    cairo_clip(cairo);             
                   
                    y0=h+3.1*rowHeight;                 
                  }
                else
                  { 
                    cairo_move_to(cairo,x,y-1.5*rowHeight);
                    pango.setMarkup(latexToPango(value->name)+":");
                    pango.show(); 
                    size_t labelDim1=0, labelDim2=1; 					    
                    string vName;
                    if (v->type()==VariableType::parameter)
                      for (size_t k=0; k<rank; k++)  
                        {
                          vName=static_cast<string>(value->hypercube().xvectors[k].name);
                          if (v->getDimLabelsPicked().first==vName) labelDim1=k;
                          if (v->getDimLabelsPicked().second==vName) labelDim2=k;
                          else if (v->getDimLabelsPicked().second=="") labelDim2=labelDim1+1;
                        }
						
                    if ((labelDim1&1)==0) y+=rowHeight; // allow room for header row
                    string format=value->hypercube().xvectors[labelDim1].dimension.units;
                    for (auto& i: value->hypercube().xvectors[labelDim1])
                      {
                        cairo_move_to(cairo,x,y);
                        pango.setText(trimWS(str(i,format)));
                        pango.show();
                        y+=rowHeight;
                        colWidth=std::max(colWidth,5+pango.width());
                      }                                             
                    y=y0;  
                    x+=colWidth;
                    lh=0;                 
                    for (size_t j=0; j<dims[labelDim1]; ++j)
                      lh+=rowHeight;                         
                    format=value->hypercube().xvectors[labelDim2].timeFormat();
                    for (size_t i=0; i<dims[labelDim2]; ++i)
                      {
                        colWidth=0;
                        y=y0;
                        cairo_move_to(cairo,x,y);
                        pango.setText(trimWS(str(value->hypercube().xvectors[labelDim2][i],format)));
                        pango.show();
                        { // draw vertical grid line
                          cairo::CairoSave cs(cairo);
                          cairo_set_source_rgba(cairo,0,0,0,0.5);
                          cairo_move_to(cairo,x-2.5,y0);
                          cairo_line_to(cairo,x-2.5,y0+lh+1.1*rowHeight);
                          cairo_stroke(cairo);
                        }
                        colWidth=std::max(colWidth, 5+pango.width());
                        for (size_t j=0; j<dims[labelDim1]; ++j)
                          {
                            y+=rowHeight;
                            if (y>2e09) break;
                            cairo_move_to(cairo,x,y);
                            auto v=value->atHCIndex(j+i*dims[labelDim1]);
                            if (!std::isnan(v))
                              {
                                pango.setText(str(v));
                                pango.show();
                              }
                            colWidth=std::max(colWidth, pango.width());
                          }
                        x+=colWidth;
                        if (x>2e09) break;
                      }      
                    h_prev=h;
                    w=0;h=0;      
                    cairo_get_current_point (cairo,&w,&h);   
                    if (h<h_prev) h+=h_prev;                                                                         
                    // draw grid
                    {
				      		
                      cairo::CairoSave cs(cairo);
                      cairo_set_source_rgba(cairo,0,0,0,0.2);
                      for (y=y0+rowHeight; y<h+rowHeight; y+=2*rowHeight)
                        {
                          cairo_rectangle(cairo,x0,y,w+colWidth,rowHeight);
                          cairo_fill(cairo);
                        }
                    }
                    { // draw horizontal grid line
                      cairo::CairoSave cs(cairo);
                      cairo_set_source_rgba(cairo,0,0,0,0.5);
                      cairo_move_to(cairo,x0,y0+1.1*rowHeight);
                      cairo_line_to(cairo,w+colWidth,y0+1.1*rowHeight);
                      cairo_stroke(cairo);
                    }                         
                    cairo::CairoSave cs(cairo);
                    float rectHeight=0;
                    // make sure rectangle has right height
                    if ((labelDim1&1)==0) rectHeight= y-y0;
                    else rectHeight=y-y0-rowHeight;
                    cairo_rectangle(cairo,x0,y0,w+colWidth,rectHeight);    
                    cairo_stroke(cairo);                          	        
                    cairo_clip(cairo);		        
                   
                    x+=0.25*colWidth;      
                    y=y0;                	
			
						
                  }               
                if (rank>0) y0=h+3.1*rowHeight;
                else y0+=4.1*rowHeight;   
               
              }
          }
      }
    catch (...) {throw;/* exception most likely invalid variable value */}
  }

  namespace
  {    
    struct CroppedPango: public Pango
    {
      cairo_t* cairo;
      double w, x=0, y=0;
      CroppedPango(cairo_t* cairo, double width): Pango(cairo), cairo(cairo), w(width) {}
      void setxy(double xx, double yy) {x=xx; y=yy;}
      void show() {
        CairoSave cs(cairo);
        cairo_rectangle(cairo,x,y,w,height());
        cairo_clip(cairo);
        cairo_move_to(cairo,x,y);
        Pango::show();
      }
    };
  }

  void ParVarSheet::redraw(int, int, int width, int height)
  {
    if (surface.get()) {
        cairo_t* cairo=surface->cairo();  
        CroppedPango pango(cairo, colWidth);
        rowHeight=15;
        pango.setFontSize(5.0*rowHeight);
	    
        if (!minsky().canvas.model->empty()) {	  
          populateItemVector();			               
          cairo_translate(cairo,offsx,offsy); 
          draw(cairo); 
          ecolab::cairo::Surface surf
            (cairo_recording_surface_create(CAIRO_CONTENT_COLOR_ALPHA,NULL));            
          draw(surf.cairo());      
          m_width=surf.width();
          m_height=surf.height();
        }     
      }
    }

}
